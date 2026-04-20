export type KitInfo = {
  slug: string;
  name: string;
  scale: string;
  era: string;
  summary: string;
  gallery: string[];
  status: string;
  note: string;
};

export const plamoKits: KitInfo[] = [
  {
    slug: 'rx78-2-gundam',
    name: 'RX-78-2 ガンダム',
    scale: '1/144',
    era: '宇宙世紀',
    summary: '成形色を活かしつつ、スミ入れとつや消しで質感を調整した作品。',
    gallery: ['正面', '右側面', '背面', 'バストアップ', '武器構え'],
    status: '完成',
    note: '基本塗装と軽めのウェザリングで仕上げ。',
  },
  {
    slug: 'zaku-ii-f2',
    name: 'ザクII F2',
    scale: '1/100',
    era: '宇宙世紀',
    summary: '関節の可動域を広げながら、軽いダメージ表現を追加した製作記録。',
    gallery: ['素組み状態', '塗装途中', 'デカール貼付', 'トップコート後', '完成全景'],
    status: '製作中',
    note: '関節塗り分けとデカール調整を進行中。',
  },
  {
    slug: 'sazabi-verka',
    name: 'サザビー Ver.Ka',
    scale: '1/100',
    era: '逆襲のシャア',
    summary: '外装を段階的に塗り重ね、陰影を強調した重厚感のある仕上がり。',
    gallery: ['全身正面', '左腕ディテール', 'シールド', 'バックパック', 'ポージング'],
    status: '完成',
    note: 'メタリック塗装とトップコートを複数層で施工。',
  },
];