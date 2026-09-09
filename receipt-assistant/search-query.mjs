const PRODUCT_CONCEPTS = [
  { zh: ['吸尘器', '吸尘'], terms: ['aspirador', 'aspiradora', 'vacuum'] },
  { zh: ['扫地机器人', '扫地机', '机器人吸尘器'], terms: ['robot aspirador', 'robot aspiradora', 'roomba'] },
  { zh: ['咖啡机'], terms: ['cafetera', 'máquina de café', 'coffee machine'] },
  { zh: ['打印机'], terms: ['impresora', 'printer'] },
  { zh: ['电视', '电视机'], terms: ['televisor', 'televisión', 'TV'] },
  { zh: ['电脑', '笔记本电脑', '笔记本'], terms: ['ordenador', 'portátil', 'laptop'] },
  { zh: ['手机', '电话'], terms: ['móvil', 'teléfono', 'smartphone'] },
  { zh: ['平板', '平板电脑'], terms: ['tablet'] },
  { zh: ['洗衣机'], terms: ['lavadora'] },
  { zh: ['洗碗机'], terms: ['lavavajillas'] },
  { zh: ['冰箱', '冰柜'], terms: ['frigorífico', 'nevera', 'congelador'] },
  { zh: ['烤箱'], terms: ['horno'] },
  { zh: ['微波炉'], terms: ['microondas'] },
  { zh: ['空调'], terms: ['aire acondicionado', 'climatizador'] },
  { zh: ['暖气', '取暖器'], terms: ['calefactor', 'radiador'] },
  { zh: ['风扇'], terms: ['ventilador'] },
  { zh: ['吹风机', '电吹风'], terms: ['secador', 'secador de pelo'] },
  { zh: ['熨斗'], terms: ['plancha'] },
  { zh: ['搅拌机', '料理机'], terms: ['batidora', 'licuadora'] },
  { zh: ['锅', '铸铁锅', '炖锅'], terms: ['cazuela', 'cocotte', 'olla', 'sartén'] },
  { zh: ['水龙头'], terms: ['grifo'] },
  { zh: ['马桶'], terms: ['inodoro', 'WC'] },
  { zh: ['床垫'], terms: ['colchón'] },
  { zh: ['沙发'], terms: ['sofá'] },
  { zh: ['桌子', '餐桌'], terms: ['mesa'] },
  { zh: ['椅子', '扶手椅'], terms: ['silla', 'sillón'] },
  { zh: ['家具'], terms: ['mueble', 'muebles'] },
  { zh: ['灯', '灯具'], terms: ['lámpara', 'luz'] },
  { zh: ['工具'], terms: ['herramienta', 'herramientas'] },
  { zh: ['电钻'], terms: ['taladro'] },
  { zh: ['割草机'], terms: ['cortacésped'] },
  { zh: ['泳池机器人', '泳池清洁机器人'], terms: ['robot piscina', 'limpiafondos', 'limpiador de piscina'] },
  { zh: ['水泵', '泳池泵'], terms: ['bomba', 'bomba de piscina'] },
  { zh: ['自行车'], terms: ['bicicleta'] },
  { zh: ['婴儿车', '童车'], terms: ['cochecito', 'carrito de bebé'] },
  { zh: ['儿童座椅', '安全座椅'], terms: ['silla infantil', 'silla de coche'] },
  { zh: ['玩具'], terms: ['juguete', 'juguetes'] },
  { zh: ['耳机'], terms: ['auriculares'] },
  { zh: ['音箱', '音响'], terms: ['altavoz', 'altavoces'] },
  { zh: ['相机', '照相机'], terms: ['cámara'] },
  { zh: ['路由器'], terms: ['router'] },
];

const RETAILER_CONCEPTS = [
  { zh: ['宜家'], terms: ['IKEA'] },
  { zh: ['家乐福'], terms: ['Carrefour'] },
  { zh: ['麦德龙'], terms: ['Makro'] },
  { zh: ['亚马逊'], terms: ['Amazon'] },
  { zh: ['英格列斯百货'], terms: ['El Corte Inglés'] },
  { zh: ['媒体市场'], terms: ['MediaMarkt'] },
  { zh: ['乐华梅兰'], terms: ['Leroy Merlin'] },
  { zh: ['迪卡侬'], terms: ['Decathlon'] },
  { zh: ['麦卡乐'], terms: ['Bauhaus'] },
  { zh: ['宜得利'], terms: ['JYSK'] },
];

const INTENT_WORDS = [
  '帮我', '帮忙', '查找', '找一下', '找找', '找到', '搜索', '看看', '看一下',
  '买的', '购买', '那个', '这个', '我的', '我', '小票', '票据', '发票', '收据',
  '保修', '售后', '维修', '凭证', '购物', '商品', '东西', '一张', '一下',
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function quoteSearchTerm(term) {
  const value = String(term).trim();
  if (!value) return '';
  if (/^[\p{L}\p{N}._]+$/u.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

function makeOrGroup(terms) {
  const safe = unique(terms).map(quoteSearchTerm).filter(Boolean);
  if (safe.length === 0) return '';
  if (safe.length === 1) return safe[0];
  return `(${safe.join(' OR ')})`;
}

function extractLatinAndNumberTokens(input) {
  const matches = input.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9._/+&'’-]*/g) ?? [];
  return unique(matches.map((token) => token.trim()).filter((token) => token.length > 1 || /^\d$/.test(token)));
}

function inferRelativeYear(input, now = new Date()) {
  const currentYear = now.getFullYear();
  if (input.includes('前年')) return String(currentYear - 2);
  if (input.includes('去年')) return String(currentYear - 1);
  if (input.includes('今年')) return String(currentYear);
  return null;
}

function stripIntentWords(input) {
  let value = input;
  for (const word of INTENT_WORDS) value = value.replaceAll(word, ' ');
  return value.replace(/\s+/g, ' ').trim();
}

function findConcepts(input, concepts) {
  return concepts.filter((concept) => concept.zh.some((term) => input.includes(term)));
}

export function expandReceiptSearchQuery(rawInput, options = {}) {
  const input = String(rawInput ?? '').trim();
  if (!input) {
    return {
      originalQuery: '',
      searchQuery: '',
      displayTerms: [],
      matchedConcepts: [],
      usedTranslation: false,
    };
  }

  const now = options.now ?? new Date();
  const productMatches = findConcepts(input, PRODUCT_CONCEPTS);
  const retailerMatches = findConcepts(input, RETAILER_CONCEPTS);
  const relativeYear = inferRelativeYear(input, now);
  const latinTokens = extractLatinAndNumberTokens(input);

  const groups = [];
  const displayTerms = [];

  for (const token of latinTokens) {
    groups.push(quoteSearchTerm(token));
    displayTerms.push(token);
  }

  for (const concept of retailerMatches) {
    groups.push(makeOrGroup(concept.terms));
    displayTerms.push(...concept.terms);
  }

  for (const concept of productMatches) {
    groups.push(makeOrGroup(concept.terms));
    displayTerms.push(...concept.terms);
  }

  if (relativeYear && !latinTokens.includes(relativeYear)) {
    groups.push(relativeYear);
    displayTerms.push(relativeYear);
  }

  const dedupedGroups = unique(groups);
  const usedTranslation = retailerMatches.length > 0 || productMatches.length > 0 || Boolean(relativeYear);

  if (dedupedGroups.length === 0) {
    const fallback = stripIntentWords(input) || input;
    return {
      originalQuery: input,
      searchQuery: fallback,
      displayTerms: [fallback],
      matchedConcepts: [],
      usedTranslation: false,
    };
  }

  return {
    originalQuery: input,
    searchQuery: dedupedGroups.join(' AND '),
    displayTerms: unique(displayTerms),
    matchedConcepts: unique([
      ...retailerMatches.flatMap((concept) => concept.zh.filter((term) => input.includes(term))),
      ...productMatches.flatMap((concept) => concept.zh.filter((term) => input.includes(term))),
    ]),
    usedTranslation,
  };
}
