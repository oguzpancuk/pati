import { RecentComments } from 'pati-web';

const comments = [
  { id: 1, body: 'Bugün mama verdim, keyfi yerinde.', created_at: '2026-08-19T08:12:00Z', health_record_id: null, animal_id: 12, animal_species: 'cat' as const, animal_name: 'Boncuk', animal_breed: 'Tekir', animal_photo_url: null },
  { id: 2, body: 'Sol patisinde hafif topallama var, veterinere haber verdim.', created_at: '2026-08-18T17:40:00Z', health_record_id: 4, animal_id: 7, animal_species: 'dog' as const, animal_name: 'Zorro', animal_breed: 'Kangal melezi', animal_photo_url: null },
  { id: 3, body: 'Komşular da düzenli besliyormuş.', created_at: '2026-08-17T09:05:00Z', health_record_id: null, animal_id: 7, animal_species: 'dog' as const, animal_name: 'Zorro', animal_breed: 'Kangal melezi', animal_photo_url: null },
];

/** Profildeki "son yorumlarım" bloğu: 3 önizleme + "Tümünü gör (N)". */
export const UcYorum = () => (
  <div style={{ width: 360 }}>
    <RecentComments comments={comments} total={7} title="Son yorumlarım" emptyText="Henüz yorum yapmadın." seeAllTo="/yorumlarim" />
  </div>
);

/** Boş durum. */
export const Bos = () => (
  <div style={{ width: 360 }}>
    <RecentComments comments={[]} total={0} title="Son yorumları" emptyText="Henüz yorum yapmamış." seeAllTo="/kullanici/80/yorumlar" />
  </div>
);
