// Kokoro's English voices, with friendly labels for the settings dropdown.
// Kept in its own module so the Settings page can list them without pulling in
// the TTS worker.
export const NATURAL_VOICES: { id: string; label: string }[] = [
  { id: 'af_heart', label: 'Heart - warm female (US)' },
  { id: 'af_bella', label: 'Bella - female (US)' },
  { id: 'af_nicole', label: 'Nicole - soft female (US)' },
  { id: 'af_sarah', label: 'Sarah - female (US)' },
  { id: 'af_sky', label: 'Sky - female (US)' },
  { id: 'am_michael', label: 'Michael - male (US)' },
  { id: 'am_adam', label: 'Adam - male (US)' },
  { id: 'am_echo', label: 'Echo - male (US)' },
  { id: 'am_fenrir', label: 'Fenrir - deep male (US)' },
  { id: 'bf_emma', label: 'Emma - female (UK)' },
  { id: 'bf_isabella', label: 'Isabella - female (UK)' },
  { id: 'bm_george', label: 'George - male (UK)' },
  { id: 'bm_lewis', label: 'Lewis - male (UK)' }
]
