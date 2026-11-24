'use strict';

/* RUTA YA v3 · Código completo del prototipo local.
 * Ruta T28 y paraderos: ficha pública de Wikiroutes.
 * Comercios: directorios, fichas públicas, Municipalidad de Uchumayo
 * y padrón de agentes de Caja Arequipa.
 *
 * Este prototipo NO recibe el GPS de las combis, no envía reportes
 * a un servidor y no procesa pagos.
 */

const STORAGE = {
  name: 'rutaya_v3_name',
  favorites: 'rutaya_v3_favorites',
  reports: 'rutaya_v3_reports'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`No se pudo leer ${key}:`, error);
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('No se pudo guardar en almacenamiento local:', error);
    showToast('No se pudo guardar. Puede que el almacenamiento esté lleno.');
    return false;
  }
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

let userName = localStorage.getItem(STORAGE.name) || '';
let favorites = readStore(STORAGE.favorites, []);
let reports = readStore(STORAGE.reports, []);
let activeCategory = 'Todos';
let direction = 'outbound';

let leafletMap = null;
let standardTiles = null;
let lightTiles = null;
let usingLightTiles = false;
let knownLayer = null;
let userMarker = null;
let accuracyCircle = null;
let gpsWatch = null;
let installPrompt = null;
let toastTimer = null;
let lastSearchAt = 0;
let lastReverseAt = 0;
let lastReversePoint = null;

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* PARADEROS PUBLICADOS: CONGATA HACIA LA MERCED */

const STOPS_OUT = [
  'Terminal Megabus AQP S.A.C. (Congata)',
  'Juan El Bueno',
  'Parque 2 Región Sierra',
  'Álvarez Thomas (Sector 1)',
  'Álvarez Thomas, Mz. V',
  'Álvarez Thomas, Mz. LL',
  'I.E. Alma Mater de Congata',
  'Estadio Municipal Segundo Calderón Chávez',
  'Plaza de Álvarez Thomas',
  'Pan de Azúcar',
  'Camino a Patio de Bombas',
  'Plaza Principal Cerro Verde',
  'Centro de Salud Cerro Verde',
  'Cerro Verde, Mz. E',
  'Parque a la Madre',
  'Alto Cerro Verde',
  'Virgen de las Peñas',
  'Entrada a Virgen de las Peñas',
  'Lorenzo Ballón',
  'Las Praderas de Tiabaya',
  'Pedro Paulet Mostajo',
  'Chusicani',
  'Desvío Paisajista',
  'Quequita',
  'Arancota',
  'Fernandini',
  'Parque de Tingo',
  'Parroquia Santísima Trinidad de Tingo',
  'Colegio Prescott',
  'I.E. Nuestra Señora de Lourdes',
  'Colegio San José',
  'Ferreyros',
  'Laive',
  'San Isidro',
  'Martinetti',
  'Palacio Metropolitano de Bellas Artes',
  'La Merced'
];

/* PARADEROS PUBLICADOS: LA MERCED HACIA CONGATA */

const STOPS_IN = [
  'La Merced',
  'Álvarez Thomas',
  'UTP',
  'Palacio Metropolitano de Bellas Artes',
  'Martinetti',
  'San Isidro',
  'Laive',
  'Ferreyros - CAT',
  'Universidad La Salle',
  'Gloria',
  'Colegio Prescott',
  'Parque de Tingo',
  'Puente Tingo',
  'Fernandini',
  'Arancota',
  'Quequita',
  'Desvío Paisajista',
  'Alata',
  'Pedro Paulet Mostajo',
  'Las Praderas de Tiabaya',
  'Lorenzo Ballón',
  'Entrada a Virgen de las Peñas',
  'Virgen de las Peñas',
  'Alto Cerro Verde',
  'Parque a la Madre',
  'Cerro Verde, Mz. G',
  'Centro de Salud Cerro Verde',
  'Plaza Principal de Cerro Verde',
  'Camino a Patio de Bombas',
  'Pan de Azúcar',
  'Plaza de Álvarez Thomas',
  'Estadio Municipal Segundo Calderón Chávez',
  'I.E. Alma Mater de Congata',
  'Ignacio Álvarez Thomas',
  'Álvarez Thomas, Mz. V',
  'Álvarez Thomas (Sector 1)',
  'Parque 2 Región Sierra',
  'Juan El Bueno',
  'Terminal Megabus AQP S.A.C. (Congata)'
];

/* COORDENADAS DE REFERENCIAS LOCALES IDENTIFICADAS.
   No representan GPS de vehículos ni todos los paraderos de la ruta. */

const KNOWN_PLACES = [
  {
    name: 'I.E. Alma Mater de Congata',
    lat: -16.44531,
    lng: -71.62063,
    note: 'Coordenada cartográfica identificada para la institución educativa.'
  },
  {
    name: 'Estadio Municipal Segundo Calderón Chávez',
    lat: -16.44653,
    lng: -71.61932,
    note: 'Coordenada cartográfica identificada para el estadio.'
  },
  {
    name: 'Plaza El Carmen de Congata',
    lat: -16.44456,
    lng: -71.62126,
    note: 'Referencia local de Congata; no se presenta como paradero T28.'
  },
  {
    name: 'Álvarez Thomas, Manzana V',
    lat: -16.44215,
    lng: -71.62281,
    note: 'Referencia cartográfica de la manzana V.'
  },
  {
    name: 'Alto Cerro Verde',
    lat: -16.45301,
    lng: -71.61289,
    note: 'Referencia cartográfica de Alto Cerro Verde.'
  },
  {
    name: 'Parque a la Madre, Cerro Verde',
    lat: -16.45282,
    lng: -71.61455,
    note: 'Referencia cartográfica del parque.'
  }
];

/* DIRECTORIO DE NEGOCIOS.
   Las fotos son imágenes referenciales del rubro.
   No son necesariamente fotografías de los establecimientos.
   No se inventan menús cuando no hay una carta verificable. */

const BUSINESSES = [
  {
    id: 'mercado-senor-milagros',
    name: 'Mercado Municipal Señor de los Milagros',
    category: 'Mercados',
    area: 'Congata · Uchumayo',
    address: 'H94H+H9Q J, Congata, Uchumayo 04400, Arequipa, Perú',
    reference: 'Mercado Municipal de Congata, conocido como “Señor de los Milagros”.',
    description: 'Mercado de abastos municipal inaugurado por la Municipalidad Distrital de Uchumayo para fortalecer la actividad comercial de Congata.',
    sells: 'Puestos de abastos y comercio local. La municipalidad no publica en esa nota un catálogo completo de puestos ni inventario.',
    best: 'No tiene una carta única. La oferta depende de cada puesto y de la disponibilidad del día.',
    benefits: 'Reúne distintos puestos de comercio en un mismo espacio y brinda a vecinos un punto de abastecimiento local.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=82',
    source: 'Municipalidad Distrital de Uchumayo: noticia de inauguración del mercado.',
    sourceUrl: 'https://muniuchumayo.gob.pe/inauguracion-del-mercado-senor-de-los-milagros/'
  },
  {
    id: 'picanteria-marilu',
    name: 'Picantería Marilú',
    category: 'Restaurantes',
    area: 'Variante de Uchumayo · Uchumayo',
    address: 'H8GP+2MP, Uchumayo, Arequipa, Perú',
    reference: 'Código Plus H8GP+2MP; directorios también la ubican en la Variante de Uchumayo, km 14.',
    description: 'Picantería arequipeña listada en Uchumayo. Fichas de restaurantes publican teléfono y reseñas de comensales.',
    sells: 'Comida tradicional de picantería. Se reportan alternativas de desayuno y almuerzo; la disponibilidad puede cambiar.',
    best: 'Reseñas mencionan frita, estofado y sopa. Reseñas antiguas también nombran chaque, chochoca, timpo y costillar; confirmar la carta actual.',
    benefits: 'Alternativa de comida tradicional; directorios señalan opción para llevar y accesibilidad.',
    phone: '+51 931 139 532',
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=82',
    source: 'Restaurant Guru y directorio Homelists; teléfono y referencia publicados. Horario y carta sujetos a confirmación.',
    sourceUrl: 'https://es.restaurantguru.com/Picanteria-Marilu-Cerro-Colorado-District'
  },
  {
    id: 'la-ramadita',
    name: 'La Ramadita',
    category: 'Restaurantes',
    area: 'Pueblo tradicional de Uchumayo',
    address: 'H8GG+4MV, Uchumayo 04401, Arequipa, Perú',
    reference: 'Código Plus H8GG+4MV, pueblo tradicional de Uchumayo.',
    description: 'Restaurante de comida peruana localizado en Uchumayo. Directorios publican su código de ubicación y teléfono.',
    sells: 'Comida peruana; algunas fichas indican servicio para llevar y entrega a domicilio.',
    best: 'En su ficha de menú aparecen chicharrón, “la bandera”, adobo y preparaciones de cerdo y carne. Confirmar disponibilidad y precios directamente.',
    benefits: 'Tiene teléfono publicado para consultas sobre carta, reservas y modalidad de atención.',
    phone: '+51 996 633 339',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82',
    source: 'Restaurant Guru: ficha y menú de La Ramadita. Horarios publicados por directorios varían; se omiten.',
    sourceUrl: 'https://es.restaurantguru.com/La-Ramadita-Arequipa/menu'
  },
  {
    id: 'gustito-criollo',
    name: 'El Gustito Criollo',
    category: 'Restaurantes',
    area: 'Urb. El Carmen · Uchumayo',
    address: 'Urb. El Carmen C1, Uchumayo, Arequipa, Perú',
    reference: 'Urbanización El Carmen, referencia C1; lote exacto por confirmar.',
    description: 'Establecimiento listado como restaurante en un directorio de Uchumayo y también incluido en un listado empresarial de restaurantes.',
    sells: 'Rubro restaurante/comida criolla según nombre comercial y clasificación. No se encontró menú público fiable.',
    best: 'Platos más vendidos no publicados o no verificados.',
    benefits: 'Amplía la oferta de restaurantes identificados en el sector El Carmen.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists y listado empresarial de restaurantes de Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'esteritas',
    name: 'Restaurante Las Esteritas',
    category: 'Restaurantes',
    area: 'Uchumayo · Urb. Juan El Bueno',
    address: 'Uchumayo, Arequipa, Perú. Directorios asocian la ficha con Urb. Juan El Bueno B-9; confirmar el lote.',
    reference: 'Sector Juan El Bueno; validar dirección exacta antes de acudir.',
    description: 'Restaurante incluido en un directorio local y en una ficha de mapas.',
    sells: 'Servicio de restaurante; no se encontró carta pública fiable para confirmar platos.',
    best: 'Menú no publicado o no verificado.',
    benefits: 'Ficha con referencia local para consultar ubicación directamente antes de visitar.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists y ficha de Waze; dirección detallada y menú sujetos a confirmación.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'ceviche',
    name: 'Cevichería “Ceviche”',
    category: 'Restaurantes',
    area: 'Av. Mariscal Ramón Castilla · Uchumayo',
    address: 'Av. Mariscal Ramón Castilla Mz. F Lt. 8, Uchumayo, Arequipa, Perú',
    reference: 'Manzana F, lote 8, Av. Mariscal Ramón Castilla.',
    description: 'Negocio clasificado como cevichería en un directorio de restaurantes de Uchumayo.',
    sells: 'Rubro cevichería. La fuente no publica una carta completa; consultar qué pescados, mariscos y platos están disponibles.',
    best: 'No se encontró una lista de platos más vendidos verificable.',
    benefits: 'Alternativa de comida marina incluida en el directorio local.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists: directorio de restaurantes en Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'dbrasa',
    name: 'Pollería D’BRASAS',
    category: 'Restaurantes',
    area: 'Uchumayo · Arequipa',
    address: 'Uchumayo, Arequipa, Perú. Dirección exacta no publicada en el directorio consultado.',
    reference: 'Uchumayo; solicitar al negocio dirección exacta antes de desplazarse.',
    description: 'Establecimiento listado como pollería en un directorio local de restaurantes.',
    sells: 'Rubro pollería. No hay catálogo público fiable de productos, tamaños o acompañamientos.',
    best: 'Carta y platos más vendidos no publicados o no verificados.',
    benefits: 'Opción de comida preparada identificada en el distrito.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists: directorio de restaurantes en Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'saida',
    name: 'Restaurant Campestre Saida',
    category: 'Restaurantes',
    area: 'El Carmen · Uchumayo',
    address: 'El Carmen J-11, Uchumayo, Arequipa, Perú',
    reference: 'Sector El Carmen, referencia J-11.',
    description: 'Restaurante campestre listado en el directorio de restaurantes de Uchumayo.',
    sells: 'Servicio de restaurante. La fuente consultada no publica una carta verificada.',
    best: 'Menú no publicado o no verificado.',
    benefits: 'Alternativa gastronómica identificada en el sector El Carmen.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists: directorio de restaurantes en Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'autentico-norteno',
    name: 'El Auténtico Sabor Norteño',
    category: 'Restaurantes',
    area: 'Álvarez Thomas · Sector 1',
    address: 'Álvarez Thomas Mz. T Lt. 10, Sector 1, Uchumayo, Arequipa, Perú',
    reference: 'Manzana T, lote 10, Sector 1 de Álvarez Thomas.',
    description: 'Restaurante incluido en el directorio de negocios de Uchumayo.',
    sells: 'Restaurante con referencia a cocina norteña en el nombre comercial. No se encontró menú público fiable.',
    best: 'Platos más vendidos no publicados o no verificados.',
    benefits: 'Opción gastronómica identificada en el sector Álvarez Thomas.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists: directorio de restaurantes en Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'valle-encantado',
    name: 'El Valle Encantando Uchumayo',
    category: 'Restaurantes',
    area: 'Uchumayo · Arequipa',
    address: 'Uchumayo, Arequipa, Perú. Dirección exacta no detallada en el directorio.',
    reference: 'El directorio lo sitúa en Uchumayo; confirmar dirección exacta con el negocio.',
    description: 'Restaurante registrado en el directorio local de Uchumayo.',
    sells: 'Servicio de restaurante; no se encontró menú público fiable.',
    best: 'Menú no publicado o no verificado.',
    benefits: 'Añade una alternativa gastronómica al directorio distrital.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists: directorio de restaurantes en Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'dxn-cafe',
    name: 'DXN Silvia Morales',
    category: 'Cafés',
    area: 'Cerro Verde · Uchumayo',
    address: 'Cerro Verde, Uchumayo, Arequipa, Perú. Dirección exacta no indicada en el directorio.',
    reference: 'Cerro Verde; confirmar ubicación exacta.',
    description: 'Ficha incluida en el directorio local bajo la categoría de café.',
    sells: 'El directorio lo clasifica como café, pero no publica un menú ni catálogo de bebidas verificable.',
    best: 'Carta no publicada o no verificada.',
    benefits: 'Alternativa del rubro cafetería identificada en Cerro Verde.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=82',
    source: 'Homelists: directorio de restaurantes y cafés en Uchumayo.',
    sourceUrl: 'https://homelists.net/restaurantes/uchumayo'
  },
  {
    id: 'abarrotes-anita',
    name: 'Abarrotes Anita',
    category: 'Tiendas',
    area: 'Pueblo Joven Cerro Verde',
    address: 'Pueblo Joven Cerro Verde Mz. N Lt. 4, Uchumayo, Arequipa, Perú',
    reference: 'Pueblo Joven Cerro Verde, manzana N, lote 4.',
    description: 'Nombre y dirección identificados en la relación de agentes corresponsales de Caja Arequipa, edición febrero de 2026.',
    sells: 'El nombre indica comercio de abarrotes. La lista oficial consultada no contiene inventario, marcas ni stock.',
    best: 'No aplica como restaurante; productos específicos no publicados.',
    benefits: 'Punto de comercio de barrio identificado en un padrón reciente de agentes.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1604719312566-8912e9c8a0f9?auto=format&fit=crop&w=900&q=82',
    source: 'Caja Arequipa, Red de Agentes Corresponsales, febrero 2026.',
    sourceUrl: 'https://www.cajaarequipa.pe/wp-content/uploads/2026/03/Red-de-Agentes-Corresponsales-2026-Febrero_compressed.pdf'
  },
  {
    id: 'vg-farma',
    name: 'V & G Farma',
    category: 'Servicios',
    area: 'Pueblo Joven Cerro Verde',
    address: 'Pueblo Joven Cerro Verde Mz. G Lt. 15, Uchumayo, Arequipa, Perú',
    reference: 'Pueblo Joven Cerro Verde, manzana G, lote 15.',
    description: 'Nombre y dirección publicados en el padrón de agentes corresponsales de Caja Arequipa de febrero de 2026.',
    sells: 'El nombre comercial sugiere actividad relacionada con farmacia; el padrón no detalla catálogo, medicamentos ni servicios actuales.',
    best: 'No aplica como restaurante; productos o servicios específicos deben confirmarse con el establecimiento.',
    benefits: 'Referencia de servicio local identificada en Cerro Verde. La ficha no asegura disponibilidad de productos.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=82',
    source: 'Caja Arequipa, Red de Agentes Corresponsales, febrero 2026.',
    sourceUrl: 'https://www.cajaarequipa.pe/wp-content/uploads/2026/03/Red-de-Agentes-Corresponsales-2026-Febrero_compressed.pdf'
  },
  {
    id: 'restaurante-maria',
    name: 'Restaurante María',
    category: 'Restaurantes',
    area: 'Alto Cerro Verde · Zona B',
    address: 'PP.JJ. Alto Cerro Verde, Zona B, Mz. B Lt. 1, Uchumayo, Arequipa, Perú',
    reference: 'Alto Cerro Verde, zona B, manzana B, lote 1.',
    description: 'Nombre comercial y dirección incluidos en el padrón de agentes de Caja Arequipa de febrero de 2026.',
    sells: 'Restaurante, según el nombre de la ficha. No se encontró menú público para confirmar platos.',
    best: 'Menú no publicado o no verificado.',
    benefits: 'Alternativa de alimentación identificada en Alto Cerro Verde.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=82',
    source: 'Caja Arequipa, Red de Agentes Corresponsales, febrero 2026.',
    sourceUrl: 'https://www.cajaarequipa.pe/wp-content/uploads/2026/03/Red-de-Agentes-Corresponsales-2026-Febrero_compressed.pdf'
  },
  {
    id: 'bazar-encantada',
    name: 'Tienda Bazar La Encantada',
    category: 'Tiendas',
    area: 'Ignacio Álvarez Thomas · Sector I',
    address: 'Ignacio Álvarez Thomas Mz. A Lt. 2, Sector I, Uchumayo, Arequipa, Perú',
    reference: 'Conjunto Habitacional Ignacio Álvarez Thomas, manzana A, lote 2, Sector I.',
    description: 'Negocio incluido en el padrón de agentes corresponsales de Caja Arequipa de febrero de 2026.',
    sells: 'Bazar/tienda según su nombre comercial. El padrón no detalla productos ni stock.',
    best: 'No aplica como restaurante; catálogo no publicado.',
    benefits: 'Punto de comercio local identificado en el Sector I de Álvarez Thomas.',
    phone: '',
    image: 'https://images.unsplash.com/photo-1604719312566-8912e9c8a0f9?auto=format&fit=crop&w=900&q=82',
    source: 'Caja Arequipa, Red de Agentes Corresponsales, febrero 2026.',
    sourceUrl: 'https://www.cajaarequipa.pe/wp-content/uploads/2026/03/Red-de-Agentes-Corresponsales-2026-Febrero_compressed.pdf'
  },
  {
    id: 'bazar-libreria-valdivia',
    name: 'Bazar Librería Valdivia',
    category: 'Tiendas',
    area: 'Uchumayo · Arequipa',
    address: 'Cerro de Pasco Lote 1, Uchumayo 04400, Arequipa, Perú',
    reference: 'Referencia publicada: calle Cerro de Pasco, lote 1, Uchumayo.',
    description: 'Pequeño comercio local listado como bazar y librería en un registro de lugares de Uchumayo.',
    sells: 'Por su denominación, artículos de bazar y librería. La lista consultada no presenta inventario ni marcas.',
    best: 'No aplica como restaurante; catálogo y artículos disponibles por confirmar.',
    benefits: 'Puede servir como punto de consulta para útiles escolares y artículos de bazar; confirma existencia y stock antes de acudir.',
    phone: '+51 982 675 243',
    image: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=82',
    source: 'Ficha de negocio/listado cartográfico de Bazar Librería Valdivia; datos de contacto y horario pueden cambiar.',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=Bazar+Libreria+Valdivia+Uchumayo'
  },
  {
    id: 'agencia-municipal-congata',
    name: 'Agencia Municipal de Congata',
    category: 'Servicios',
    area: 'Asociación El Trébol · Congata',
    address: 'Asociación El Trébol S/N, Congata, Uchumayo, Arequipa, Perú',
    reference: 'Sede municipal de atención en Congata, Asociación El Trébol.',
    description: 'Sede de la Municipalidad Distrital de Uchumayo para atención a vecinos de Congata.',
    sells: 'No es un comercio: es un servicio público municipal. La sede publica atención de lunes a viernes de 8:00 a. m. a 4:00 p. m.',
    best: 'No aplica: servicio de atención municipal, no restaurante ni tienda.',
    benefits: 'Acerca la atención municipal a los vecinos de Congata. Consultar previamente qué trámite puede atender esa sede.',
    phone: '054-411241',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=82',
    source: 'Plataforma Gob.pe, sedes de la Municipalidad Distrital de Uchumayo.',
    sourceUrl: 'https://www.gob.pe/institucion/muniuchumayo/sedes'
  }
];

/* PERFIL Y BIENVENIDA */

function updateProfile() {
  const displayName = userName || 'vecino';
  const initial = (userName.trim().charAt(0) || 'U').toUpperCase();

  $('#homeUserName').textContent = displayName;
  $('#profileName').textContent = displayName;
  $('#avatarInitial').textContent = initial;
  $('#profileAvatar').textContent = initial;
  $('#favoritesCount').textContent =
    `${favorites.length} guardado${favorites.length === 1 ? '' : 's'}`;

  $('#welcomeModal').classList.toggle('modal-hidden', Boolean(userName));
}

function saveUserName(value) {
  const clean = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);

  if (!clean) {
    showToast('Escribe tu nombre para continuar.');
    return false;
  }

  userName = clean;
  localStorage.setItem(STORAGE.name, clean);
  updateProfile();
  showToast(`¡Bienvenido, ${clean}!`);
  return true;
}

/* NAVEGACIÓN PRINCIPAL */

function showView(name) {
  const allowed = ['inicio', 'mapa', 'ruta', 'comercios', 'perfil'];
  if (!allowed.includes(name)) return;

  $$('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${name}`);
  });

  $$('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.nav === name);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'mapa') {
    setTimeout(() => {
      initMap();
      leafletMap?.invalidateSize();
    }, 120);
  }

  if (name === 'ruta') renderStops();
  if (name === 'comercios') renderBusinesses();
}

/* IMÁGENES Y COMERCIOS */

function photoMarkup(url, alt, className = '') {
  const safeUrl = escapeHTML(url);

  return `
    <img
      class="${className}"
      src="${safeUrl}"
      alt="${escapeHTML(alt)}"
      loading="lazy"
      data-fallback="1">
  `;
}

function bindImageFallbacks(root = document) {
  $$('img[data-fallback]', root).forEach(image => {
    image.addEventListener('error', () => {
      if (image.dataset.fallbackUsed) return;

      image.dataset.fallbackUsed = 'true';
      image.src = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=75';
    }, { once: true });
  });
}

function renderHomeBusinesses() {
  $('#homeCommerce').innerHTML = BUSINESSES.slice(0, 4).map(item => `
    <button class="mini-commerce" type="button" data-business-id="${escapeHTML(item.id)}">
      ${photoMarkup(item.image, `Fotografía referencial del rubro ${item.category}`)}
      <span>
        ${escapeHTML(item.name)}
        <small>${escapeHTML(item.area)} · foto referencial</small>
      </span>
    </button>
  `).join('');

  bindImageFallbacks($('#homeCommerce'));
}

function renderBusinesses() {
  const query = ($('#commerceSearch').value || '')
    .trim()
    .toLocaleLowerCase('es');

  const filtered = BUSINESSES.filter(item => {
    const categoryMatches =
      activeCategory === 'Todos' || item.category === activeCategory;

    const text = `
      ${item.name}
      ${item.category}
      ${item.area}
      ${item.address}
      ${item.sells}
    `.toLocaleLowerCase('es');

    return categoryMatches && text.includes(query);
  });

  $('#commerceResultsCaption').textContent =
    `${filtered.length} ficha${filtered.length === 1 ? '' : 's'} · información de fuentes públicas`;

  $('#commerceGrid').innerHTML = filtered.length
    ? filtered.map(item => `
      <article class="commerce-card">
        <button
          type="button"
          data-business-id="${escapeHTML(item.id)}"
          aria-label="Ver ficha de ${escapeHTML(item.name)}">

          ${photoMarkup(item.image, `Foto referencial de ${item.category.toLowerCase()}`)}

          <div class="commerce-info">
            <span class="commerce-category">${escapeHTML(item.category)} · FOTO REFERENCIAL</span>
            <h3>${escapeHTML(item.name)}</h3>
            <p>${escapeHTML(item.area)}</p>
          </div>
        </button>

        <div class="commerce-card-bottom">
          <small>${escapeHTML(item.reference.slice(0, 32))}${item.reference.length > 32 ? '…' : ''}</small>
          <span class="detail-link">Ver ficha →</span>
        </div>

        <button
          type="button"
          class="favorite-toggle ${favorites.includes(item.id) ? 'is-favorite' : ''}"
          data-favorite-id="${escapeHTML(item.id)}"
          aria-label="${favorites.includes(item.id) ? 'Quitar de favoritos' : 'Guardar en favoritos'}">
          ${favorites.includes(item.id) ? '♥' : '♡'}
        </button>
      </article>
    `).join('')
    : `
      <div class="report-summary">
        <strong>No se encontraron negocios.</strong>
        <span>Prueba con otra palabra o categoría.</span>
      </div>
    `;

  bindImageFallbacks($('#commerceGrid'));
}

function toggleFavorite(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter(favorite => favorite !== id);
  } else {
    favorites.push(id);
  }

  writeStore(STORAGE.favorites, favorites);
  renderBusinesses();
  updateProfile();

  showToast(
    favorites.includes(id)
      ? 'Guardado en tus favoritos.'
      : 'Quitado de favoritos.'
  );
}

function openBusiness(id) {
  const item = BUSINESSES.find(business => business.id === id);
  if (!item) return;

  const mapQuery = encodeURIComponent(`${item.name}, ${item.address}`);
  const mapUrl = `https://www.openstreetmap.org/search?query=${mapQuery}`;
  const phoneLine = item.phone
    ? escapeHTML(item.phone)
    : 'No se encontró un teléfono público verificable.';

  $('#commerceModalContent').innerHTML = `
    ${photoMarkup(
      item.image,
      `Foto referencial del rubro ${item.category}`,
      'commerce-detail-image'
    )}

    <div class="commerce-detail-body">
      <p class="eyebrow">${escapeHTML(item.category)} · ${escapeHTML(item.area)}</p>
      <h2 id="commerceModalTitle">${escapeHTML(item.name)}</h2>
      <p>${escapeHTML(item.description)}</p>

      <div class="detail-block">
        <strong>📍 Referencia y dirección</strong>
        <p>${escapeHTML(item.address)}<br>${escapeHTML(item.reference)}</p>
      </div>

      <div class="detail-block">
        <strong>🛍️ ¿Qué vende o qué servicio ofrece?</strong>
        <p>${escapeHTML(item.sells)}</p>
      </div>

      <div class="detail-block">
        <strong>🍽️ Mejores platos o productos destacados</strong>
        <p>${escapeHTML(item.best)}</p>
      </div>

      <div class="detail-block">
        <strong>✦ Beneficios para el cliente o la comunidad</strong>
        <p>${escapeHTML(item.benefits)}</p>
      </div>

      <div class="detail-block">
        <strong>☎ Contacto</strong>
        <p>${phoneLine}</p>
      </div>

      <div class="detail-block">
        <strong>Fuente y verificación</strong>
        <p>
          ${escapeHTML(item.source)}
          Datos variables como horarios, carta y stock deben confirmarse directamente.
          La fotografía es de referencia, no una imagen comprobada del establecimiento.
        </p>
        <p>
          <a href="${escapeHTML(item.sourceUrl)}" target="_blank" rel="noopener">
            Consultar fuente ↗
          </a>
        </p>
      </div>

      <div class="detail-actions">
        <a href="${mapUrl}" target="_blank" rel="noopener">Buscar dirección en mapa ↗</a>
        ${
          item.phone
            ? `<a href="tel:${escapeHTML(item.phone.replace(/\s/g, ''))}">Llamar</a>`
            : '<button type="button" data-no-phone>Teléfono no publicado</button>'
        }
      </div>
    </div>
  `;

  $('#commerceModal').classList.remove('modal-hidden');
  bindImageFallbacks($('#commerceModalContent'));
}

function closeBusiness() {
  $('#commerceModal').classList.add('modal-hidden');
}

/* LISTA DE PARADEROS */

function renderStops() {
  const list = direction === 'outbound' ? STOPS_OUT : STOPS_IN;

  const query = ($('#stopSearchInput').value || '')
    .trim()
    .toLocaleLowerCase('es');

  const filtered = list
    .map((name, index) => ({ name, index }))
    .filter(item => item.name.toLocaleLowerCase('es').includes(query));

  $('#stopCountLabel').textContent =
    `${filtered.length} de ${list.length} paraderos`;

  $('#stopList').innerHTML = filtered.length
    ? filtered.map(item => `
      <li class="stop-item">
        <span class="stop-number">${item.index + 1}</span>
        <span class="stop-name">${escapeHTML(item.name)}</span>
        <span class="stop-kind">T28</span>
      </li>
    `).join('')
    : `
      <li class="report-summary">
        <strong>No hay coincidencias.</strong>
        <span>Revisa el nombre del paradero.</span>
      </li>
    `;
}

function renderKnownPlaces() {
  $('#knownPlacesList').innerHTML = KNOWN_PLACES.map((place, index) => `
    <div class="known-place-row">
      <span>
        ${escapeHTML(place.name)}
        <small>${escapeHTML(place.note)}</small>
      </span>
      <button type="button" data-known-index="${index}">Ver en mapa</button>
    </div>
  `).join('');
}

/* MAPA CON OPENSTREETMAP Y LEAFLET */

function initMap() {
  if (leafletMap || !window.L) return;

  const element = $('#map');
  if (!element) return;

  leafletMap = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: true
  }).setView([-16.44531, -71.62063], 15);

  standardTiles = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }
  );

  lightTiles = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
    }
  );

  standardTiles.addTo(leafletMap);
  knownLayer = L.layerGroup().addTo(leafletMap);

  KNOWN_PLACES.forEach(place => {
    const markerIcon = L.divIcon({
      className: '',
      html: '<div class="known-pin"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    L.marker([place.lat, place.lng], { icon: markerIcon })
      .bindPopup(`
        <strong>${escapeHTML(place.name)}</strong><br>
        ${escapeHTML(place.note)}<br>
        <em>Referencia cartográfica; no es una señal GPS de la combi.</em>
      `)
      .addTo(knownLayer);
  });
}

/* GPS DEL TELÉFONO DEL USUARIO.
   No es la localización de las unidades de Megabus. */

function locateUser() {
  if (!navigator.geolocation) {
    showToast('Este navegador no permite geolocalización.');
    return;
  }

  if (gpsWatch !== null) {
    navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;

    $('#gpsStatus').textContent = 'Ubicación pausada';
    $('#gpsAccuracy').textContent = '—';
    $('#gpsDot').classList.remove('active');

    showToast('Seguimiento de tu ubicación pausado.');
    return;
  }

  $('#gpsStatus').textContent = 'Solicitando permiso del dispositivo…';

  gpsWatch = navigator.geolocation.watchPosition(
    onLocation,
    onLocationError,
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 18000
    }
  );

  showToast('Acepta el permiso de ubicación en tu navegador.');
}

function onLocation(position) {
  initMap();
  if (!leafletMap) return;

  const { latitude, longitude, accuracy } = position.coords;
  const location = [latitude, longitude];

  const icon = L.divIcon({
    className: '',
    html: '<div class="user-pin"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  if (!userMarker) {
    userMarker = L.marker(location, {
      icon,
      zIndexOffset: 1000
    }).addTo(leafletMap);
  } else {
    userMarker.setLatLng(location);
  }

  if (!accuracyCircle) {
    accuracyCircle = L.circle(location, {
      radius: accuracy,
      color: '#4289d8',
      weight: 1,
      fillColor: '#4289d8',
      fillOpacity: .11
    }).addTo(leafletMap);
  } else {
    accuracyCircle.setLatLng(location).setRadius(accuracy);
  }

  userMarker.bindPopup(`
    <strong>Tu ubicación</strong><br>
    Precisión estimada del dispositivo: ±${Math.round(accuracy)} m
  `);

  leafletMap.setView(location, Math.max(16, leafletMap.getZoom()));

  $('#gpsStatus').textContent = 'GPS de tu dispositivo activo';
  $('#gpsAccuracy').textContent = `Precisión ±${Math.round(accuracy)} m`;
  $('#gpsDot').classList.add('active');

  reverseGeocode(latitude, longitude);
}

function onLocationError(error) {
  if (gpsWatch !== null) {
    navigator.geolocation.clearWatch(gpsWatch);
  }

  gpsWatch = null;

  const messages = {
    1: 'Se denegó el permiso. Activa ubicación en los ajustes del navegador.',
    2: 'No se pudo obtener tu ubicación. Revisa el GPS del dispositivo.',
    3: 'El GPS tardó demasiado. Inténtalo de nuevo con mejor señal.'
  };

  $('#gpsStatus').textContent = 'No se pudo activar el GPS';
  $('#gpsAccuracy').textContent = '—';
  $('#gpsDot').classList.remove('active');

  showToast(messages[error.code] || 'Error al obtener ubicación.');
}

/* CONVIERTE COORDENADAS A UNA REFERENCIA DE DIRECCIÓN */

async function reverseGeocode(lat, lon) {
  const now = Date.now();

  if (now - lastReverseAt < 25000) return;

  if (
    lastReversePoint &&
    leafletMap.distance([lat, lon], lastReversePoint) < 160
  ) {
    return;
  }

  lastReverseAt = now;
  lastReversePoint = [lat, lon];

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

    const response = await fetch(url, {
      headers: { 'Accept-Language': 'es' }
    });

    if (!response.ok) return;

    const data = await response.json();

    if (data.display_name && userMarker) {
      userMarker.setPopupContent(`
        <strong>Tu ubicación</strong><br>
        ${escapeHTML(data.display_name)}<br>
        <small>Nombre de dirección estimado por OpenStreetMap.</small>
      `);
    }
  } catch (error) {
    console.warn('No se pudo obtener la dirección aproximada:', error);
  }
}

/* BUSCADOR DEL MAPA */

async function searchMap() {
  const query = $('#mapSearchInput').value.trim();

  if (!query) {
    showToast('Escribe una dirección o lugar.');
    return;
  }

  if (Date.now() - lastSearchAt < 1100) {
    showToast('Espera un momento antes de otra búsqueda.');
    return;
  }

  lastSearchAt = Date.now();
  initMap();

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(`${query}, Uchumayo, Arequipa, Perú`)}`;

    const response = await fetch(url, {
      headers: { 'Accept-Language': 'es' }
    });

    if (!response.ok) {
      throw new Error('Servicio de búsqueda no disponible.');
    }

    const results = await response.json();

    if (!results.length) {
      showToast('No encontramos coincidencias en OpenStreetMap.');
      return;
    }

    const result = results[0];
    const point = [Number(result.lat), Number(result.lon)];

    leafletMap.setView(point, 17);

    L.popup()
      .setLatLng(point)
      .setContent(`
        <strong>${escapeHTML(result.name || query)}</strong><br>
        <small>Coincidencia de búsqueda OpenStreetMap. No confirma que sea un paradero oficial T28.</small>
      `)
      .openOn(leafletMap);

  } catch (error) {
    console.error(error);
    showToast('No se pudo consultar el mapa. Revisa tu conexión.');
  }
}

function focusKnownPlace(index) {
  const place = KNOWN_PLACES[index];
  if (!place) return;

  showView('mapa');

  setTimeout(() => {
    initMap();
    leafletMap?.setView([place.lat, place.lng], 17);
  }, 150);
}

/* COMPRESIÓN DE IMÁGENES PARA LOS REPORTES */

async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) return '';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('No se pudo leer la imagen.'));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('Archivo de imagen no válido.'));
      };

      img.onload = () => {
        const maxSize = 900;
        const ratio = Math.min(
          1,
          maxSize / Math.max(img.width, img.height)
        );

        const canvas = document.createElement('canvas');

        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));

        const context = canvas.getContext('2d');

        context.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(canvas.toDataURL('image/jpeg', .66));
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/* REPORTES LOCALES */

async function submitReport(event) {
  event.preventDefault();

  const type = $('#reportType').value;
  const place = $('#reportPlace').value.trim();
  const description = $('#reportDescription').value.trim();
  const file = $('#reportPhoto').files[0];

  if (!type || !place || !description) {
    showToast('Completa tipo, zona y descripción.');
    return;
  }

  if (file && file.size > 5 * 1024 * 1024) {
    showToast('La foto debe pesar menos de 5 MB.');
    return;
  }

  try {
    const image = file ? await compressImage(file) : '';

    const report = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      place,
      description,
      image,
      createdAt: new Date().toISOString(),
      status: 'Pendiente de verificación · guardado en este dispositivo'
    };

    reports.unshift(report);
    reports = reports.slice(0, 8);

    if (!writeStore(STORAGE.reports, reports)) return;

    $('#reportForm').reset();
    renderReports();

    showToast('Reporte guardado localmente. No se envió al operador.');

  } catch (error) {
    console.error(error);
    showToast('No se pudo procesar la fotografía. Intenta sin imagen.');
  }
}

function renderReports() {
  const host = $('#reportsList');

  if (!reports.length) {
    host.innerHTML = `
      <div class="report-summary">
        <strong>No hay reportes guardados.</strong>
        <span>Cuando registres uno, aparecerá aquí en este dispositivo.</span>
      </div>
    `;

    $('#homeReports').innerHTML = `
      <strong>Aún no hay reportes guardados.</strong>
      <span>Los reportes de prueba se conservan solo en tu dispositivo.</span>
    `;

    return;
  }

  host.innerHTML = reports.map(report => `
    <article class="report-item">
      <strong>${escapeHTML(report.type)} · ${escapeHTML(report.place)}</strong>
      <p>${escapeHTML(report.description)}</p>
      <small>
        ${new Date(report.createdAt).toLocaleString('es-PE')}
        · ${escapeHTML(report.status)}
      </small>
      ${
        report.image
          ? `<img src="${report.image}" alt="Fotografía adjunta al reporte">`
          : ''
      }
    </article>
  `).join('');

  $('#homeReports').innerHTML = `
    <strong>
      ${reports.length} reporte${reports.length === 1 ? '' : 's'}
      guardado${reports.length === 1 ? '' : 's'} localmente.
    </strong>
    <span>Sin verificación ni envío a la empresa.</span>
  `;
}

/* ESTADO DE CONEXIÓN */

function updateOnlineStatus() {
  const online = navigator.onLine;

  $('#onlineLabel').textContent = online ? 'En línea' : 'Sin conexión';
  $('#onlineDot').classList.toggle('online', online);
}

/* INSTALACIÓN COMO APLICACIÓN */

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();

    const result = await installPrompt.userChoice;

    if (result?.outcome === 'accepted') {
      showToast('Instalación iniciada.');
    }

    installPrompt = null;
  } else {
    showToast('En Chrome: menú ⋮ → Instalar aplicación o Añadir a pantalla principal.');
  }
}

/* BORRAR DATOS GUARDADOS EN EL DISPOSITIVO */

function clearLocalData() {
  const confirmed = confirm(
    '¿Borrar tu nombre, favoritos y reportes de este dispositivo?'
  );

  if (!confirmed) return;

  localStorage.removeItem(STORAGE.name);
  localStorage.removeItem(STORAGE.favorites);
  localStorage.removeItem(STORAGE.reports);

  userName = '';
  favorites = [];
  reports = [];

  updateProfile();
  renderReports();
  renderBusinesses();
  renderHomeBusinesses();

  showToast('Datos locales eliminados.');
}

/* EVENTOS DE LOS BOTONES Y FORMULARIOS */

function bindEvents() {
  $('#welcomeForm').addEventListener('submit', event => {
    event.preventDefault();

    if (saveUserName($('#welcomeNameInput').value)) {
      $('#welcomeModal').classList.add('modal-hidden');
    }
  });

  $('#editNameBtn').addEventListener('click', () => {
    $('#welcomeNameInput').value = userName;
    $('#welcomeModal').classList.remove('modal-hidden');
  });

  $('#profileEditBtn').addEventListener('click', () => {
    $('#welcomeNameInput').value = userName;
    $('#welcomeModal').classList.remove('modal-hidden');
  });

  $('#openProfileBtn').addEventListener('click', () => {
    showView('perfil');
  });

  $$('[data-nav]').forEach(button => {
    button.addEventListener('click', () => {
      showView(button.dataset.nav);
    });
  });

  $$('[data-go]').forEach(button => {
    button.addEventListener('click', () => {
      showView(button.dataset.go);
    });
  });

  $$('[data-view-link]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      showView('inicio');
    });
  });

  $('#homeCommerce').addEventListener('click', event => {
    const button = event.target.closest('[data-business-id]');

    if (button) {
      openBusiness(button.dataset.businessId);
    }
  });

  $('#commerceGrid').addEventListener('click', event => {
    const favoriteButton = event.target.closest('[data-favorite-id]');

    if (favoriteButton) {
      toggleFavorite(favoriteButton.dataset.favoriteId);
      return;
    }

    const businessButton = event.target.closest('[data-business-id]');

    if (businessButton) {
      openBusiness(businessButton.dataset.businessId);
    }
  });

  $('#closeCommerceModal').addEventListener('click', closeBusiness);

  $('#commerceModal').addEventListener('click', event => {
    if (event.target === $('#commerceModal')) {
      closeBusiness();
    }

    if (event.target.closest('[data-no-phone]')) {
      showToast('El teléfono de este establecimiento no está publicado en la fuente consultada.');
    }
  });

  $('#commerceSearch').addEventListener('input', renderBusinesses);

  $('#commerceFilters').addEventListener('click', event => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;

    activeCategory = chip.dataset.category;

    $$('.filter-chip').forEach(button => {
      button.classList.toggle('active', button === chip);
    });

    renderBusinesses();
  });

  $('#outboundBtn').addEventListener('click', () => {
    direction = 'outbound';
    $('#outboundBtn').classList.add('active');
    $('#inboundBtn').classList.remove('active');
    renderStops();
  });

  $('#inboundBtn').addEventListener('click', () => {
    direction = 'inbound';
    $('#inboundBtn').classList.add('active');
    $('#outboundBtn').classList.remove('active');
    renderStops();
  });

  $('#stopSearchInput').addEventListener('input', renderStops);

  $('#locateBtn').addEventListener('click', locateUser);
  $('#mapSearchBtn').addEventListener('click', searchMap);

  $('#mapSearchInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') searchMap();
  });

  $('#mapZoomIn').addEventListener('click', () => {
    leafletMap?.zoomIn();
  });

  $('#mapZoomOut').addEventListener('click', () => {
    leafletMap?.zoomOut();
  });

  $('#baseLayerBtn').addEventListener('click', () => {
    initMap();

    if (!leafletMap) return;

    usingLightTiles = !usingLightTiles;

    if (usingLightTiles) {
      leafletMap.removeLayer(standardTiles);
      lightTiles.addTo(leafletMap);
      showToast('Estilo claro activado.');
    } else {
      leafletMap.removeLayer(lightTiles);
      standardTiles.addTo(leafletMap);
      showToast('Mapa estándar activado.');
    }
  });

  $('#fitKnownBtn').addEventListener('click', () => {
    initMap();

    if (!leafletMap) return;

    const bounds = L.latLngBounds(
      KNOWN_PLACES.map(place => [place.lat, place.lng])
    );

    leafletMap.fitBounds(bounds.pad(.18));

    showToast('Mostrando solo referencias con coordenadas conocidas.');
  });

  $('#knownPlacesList').addEventListener('click', event => {
    const button = event.target.closest('[data-known-index]');

    if (button) {
      focusKnownPlace(Number(button.dataset.knownIndex));
    }
  });

  $('#reportForm').addEventListener('submit', submitReport);

  $('#premiumInfoBtn').addEventListener('click', () => {
    showToast('Premium es una propuesta. Requiere convenio, GPS oficial y plataforma de pagos.');
  });

  $('#installAppBtn').addEventListener('click', installApp);

  $('#favoritesBtn').addEventListener('click', () => {
    showView('comercios');

    activeCategory = 'Todos';
    $('#commerceSearch').value = '';

    $$('.filter-chip').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.category === 'Todos'
      );
    });

    renderBusinesses();

    showToast(
      favorites.length
        ? `Tienes ${favorites.length} favorito(s). Busca el corazón marcado.`
        : 'Todavía no guardaste favoritos.'
    );
  });

  $('#clearLocalBtn').addEventListener('click', clearLocalData);

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
}

/* SERVICE WORKER: INSTALACIÓN Y CACHÉ */

function registerServiceWorker() {
  if (
    'serviceWorker' in navigator &&
    (
      location.protocol === 'https:' ||
      location.hostname === 'localhost'
    )
  ) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(error => {
        console.warn('No se pudo activar el modo PWA:', error);
      });
  }
}

/* INICIO DE LA APLICACIÓN */

function initApp() {
  updateProfile();
  renderHomeBusinesses();
  renderBusinesses();
  renderStops();
  renderKnownPlaces();
  renderReports();
  updateOnlineStatus();
  bindEvents();
  bindImageFallbacks();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', initApp);