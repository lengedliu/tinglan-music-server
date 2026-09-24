export const cleanDeviceName = (name?: string): string => {
  if (!name) return '小爱音箱';
  return name.replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim() || '小爱音箱';
};
