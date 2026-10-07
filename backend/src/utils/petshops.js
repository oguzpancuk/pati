const { coordinate, isPresent } = require('./numbers');

/**
 * Petshop listings: the rules for what the admin form may store, kept apart
 * from the controller so they can be tested without a database.
 */

const LIMITS = { name: 120, address: 300, phone: 40, openingHours: 300, websiteUrl: 500 };

// Digits a dialable number has: a Turkish landline with its area code is 10
// or 11, `444 1 234` call-centre numbers are 7, and E.164 stops at 15.
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

/**
 * Whether a listing is on the map right now. The map and the admin list's
 * "Haritada" tag must agree, so both read this one fragment.
 */
const LISTED_NOW_SQL = `(NOT hidden
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now()))`;

/** Trimmed text, null when empty; `undefined` when the field was not sent. */
function optionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function optionalDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Validates a whole listing as the admin form sends it (create, and update
 * after merging onto the stored row). Returns `{ value, error }`: `error` is
 * a Turkish sentence for the form, `value` the normalised row.
 */
function parsePetshopInput(body) {
  const name = optionalText(body.name);
  if (!name) return { value: null, error: 'Dükkân adı zorunludur' };
  if (name.length > LIMITS.name) {
    return { value: null, error: `Dükkân adı en fazla ${LIMITS.name} karakter olabilir` };
  }

  if (!isPresent(body.lat) || !isPresent(body.lng)) {
    return { value: null, error: 'Konum zorunludur (enlem, boylam)' };
  }
  const at = coordinate(body.lat, body.lng);
  if (!at) return { value: null, error: 'Konum geçerli bir enlem ve boylam olmalıdır' };

  const address = optionalText(body.address) ?? null;
  if (address && address.length > LIMITS.address) {
    return { value: null, error: `Adres en fazla ${LIMITS.address} karakter olabilir` };
  }

  const phone = optionalText(body.phone) ?? null;
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (
      phone.length > LIMITS.phone ||
      !/^\+?[\d\s().-]+$/.test(phone) ||
      digits < PHONE_MIN_DIGITS ||
      digits > PHONE_MAX_DIGITS
    ) {
      return { value: null, error: 'Telefon numarası geçerli görünmüyor' };
    }
  }

  const openingHours = optionalText(body.openingHours) ?? null;
  if (openingHours && openingHours.length > LIMITS.openingHours) {
    return {
      value: null,
      error: `Çalışma saatleri en fazla ${LIMITS.openingHours} karakter olabilir`,
    };
  }

  // http(s) only: the link is opened by every client, and a `javascript:`
  // address in an <a href> would run in the web client's origin.
  const websiteUrl = optionalText(body.websiteUrl) ?? null;
  if (
    websiteUrl &&
    (!/^https?:\/\/[^\s]+$/i.test(websiteUrl) || websiteUrl.length > LIMITS.websiteUrl)
  ) {
    return { value: null, error: 'Bağlantı http:// veya https:// ile başlamalıdır' };
  }

  const startsAt = optionalDate(body.startsAt);
  const endsAt = optionalDate(body.endsAt);
  if (startsAt === undefined || endsAt === undefined) {
    return { value: null, error: 'Başlangıç ve bitiş geçerli bir tarih olmalıdır' };
  }
  // As instants: ISO text stops sorting by time past year 9999 ("+010000-…").
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { value: null, error: 'Bitiş tarihi başlangıçtan sonra olmalıdır' };
  }

  // A real boolean or nothing: coercing "true" or 1 to false would let an
  // edit sent as form text put a hidden listing back on the public map.
  if (body.hidden !== undefined && body.hidden !== null && typeof body.hidden !== 'boolean') {
    return { value: null, error: 'Gizli alanı true ya da false olmalıdır' };
  }

  return {
    value: {
      name,
      address,
      phone,
      openingHours,
      websiteUrl,
      lat: at.lat,
      lng: at.lng,
      startsAt,
      endsAt,
      hidden: body.hidden === true,
    },
    error: null,
  };
}

module.exports = { parsePetshopInput, LISTED_NOW_SQL };
