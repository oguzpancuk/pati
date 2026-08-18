/**
 * Bir kullanıcıyı yönetici yapar.
 *
 * İlk admin bir yerden gelmek zorunda ve bunu API'den yapmak mümkün değil
 * (admin uç noktaları zaten admin yetkisi istiyor — yumurta-tavuk). Bu yüzden
 * sunucuya erişimi olan biri tarafından elle çalıştırılan bir script kullanıyoruz.
 *
 * Kullanım:
 *   npm run make-admin -- ornek@eposta.com
 *   npm run make-admin -- ornek@eposta.com --revoke   (yöneticiliği geri al)
 */
require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('Kullanım: npm run make-admin -- eposta@adresi.com [--revoke]');
    process.exit(1);
  }

  const role = revoke ? 'user' : 'admin';
  const result = await pool.query(
    'UPDATE users SET role = $1 WHERE lower(email) = lower($2) RETURNING id, name, email, role',
    [role, email]
  );

  if (result.rows.length === 0) {
    console.error(`"${email}" adresiyle kayıtlı bir kullanıcı bulunamadı.`);
    console.error('Önce uygulamadan kayıt olun, sonra bu scripti çalıştırın.');
    process.exit(1);
  }

  const user = result.rows[0];
  console.log(
    revoke
      ? `${user.name} <${user.email}> artık yönetici değil (rol: ${user.role}).`
      : `${user.name} <${user.email}> artık yönetici (rol: ${user.role}).`
  );
  console.log('\nAdmin paneline bu hesapla giriş yapabilirsiniz.');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Başarısız:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
