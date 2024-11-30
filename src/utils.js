export function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

const URL = "https://api.adeos.coffeeinc.in";

export const ENDPOINTS = {
  CATEGORIZE: `${URL}/categorize`,
  SET_DPI: `${URL}/set_dpi`,
  SAVE_M_OBB: `${URL}/save_m_obb`,
  EXTRACT: `${URL}/extract`
};