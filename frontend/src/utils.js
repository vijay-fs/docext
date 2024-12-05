export function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

const URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

export const ENDPOINTS = {
  CATEGORIZE: `${URL}/categorize`,
  SET_DPI: `${URL}/set_dpi`,
  SAVE_M_OBB: `${URL}/save_m_obb`,
  EXTRACT: `${URL}/v2/extract`,
  EXTRACTJOBID: `${URL}/v2/extract/`,
  CANCELJOBID: `${URL}/v2/cancel/`,
};