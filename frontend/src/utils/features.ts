// Author: Kishore Kumar
// Feature switches read from frontend/.env (Vite reads them at start-up — restart `npm run dev`
// or rebuild after changing one).

/** VITE_REGRESSION_MAINTENANCE=true: the Regression tab — and Batch Analysis on the Analyze page, which works on
 *  Regression runs — show an "under maintenance" popup instead (admins can open them anyway). */
export const REGRESSION_MAINTENANCE = import.meta.env.VITE_REGRESSION_MAINTENANCE === 'true'
