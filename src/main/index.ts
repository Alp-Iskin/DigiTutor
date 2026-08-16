import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell
} from 'electron'
import { join } from 'path'
import { captureScreen } from './screenshot'
import { trayIcon, appIcon } from './icon'
import {
  getSettings,
  saveSettings,
  Settings,
  getApiKeyStatus,
  getApiKey,
  setApiKey
} from './store'
import { ask } from './ai'
import { ChatMessage } from './ai/types'

const isDev = !!process.env.ELECTRON_RENDERER_URL

const POPUP_WIDTH = 400
// Phone-like: tall by default. The window never goes below this (clamped to the
// screen), but still grows up to the screen height for long answers.
const POPUP_MIN_HEIGHT = 672
const POPUP_MARGIN = 16

let tray: Tray | null = null
let popup: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let currentAbort: AbortController | null = null

// ---------- window helpers ----------

function rendererUrl(entry: 'popup' | 'settings'): string | null {
  if (isDev) return `${process.env.ELECTRON_RENDERER_URL}/${entry}/index.html`
  return null
}

function loadRenderer(win: BrowserWindow, entry: 'popup' | 'settings'): void {
  const url = rendererUrl(entry)
  if (url) win.loadURL(url)
  else win.loadFile(join(__dirname, `../renderer/${entry}/index.html`))
}

function positionPopup(height: number): void {
  if (!popup) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const h = Math.min(Math.max(height, POPUP_MIN_HEIGHT), area.height - POPUP_MARGIN * 2)
  const x = area.x + area.width - POPUP_WIDTH - POPUP_MARGIN
  const y = area.y + area.height - h - POPUP_MARGIN
  popup.setBounds({ x, y, width: POPUP_WIDTH, height: Math.round(h) })
}

function createPopup(): void {
  popup = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_MIN_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  popup.setAlwaysOnTop(true, 'screen-saver')
  popup.on('closed', () => {
    popup = null
  })
  loadRenderer(popup, 'popup')
}

async function activatePopup(
  opts: { withScreenshot?: boolean; autoListen?: boolean } = {}
): Promise<void> {
  const { withScreenshot = true, autoListen = false } = opts
  if (!popup) createPopup()
  let screenshot: string | null = null
  if (withScreenshot) {
    try {
      screenshot = await captureScreen()
    } catch (err) {
      console.error('Screenshot failed:', err)
    }
  }
  const apiKeyStatus = getApiKeyStatus()
  positionPopup(POPUP_MIN_HEIGHT)
  popup!.showInactive()
  popup!.setAlwaysOnTop(true, 'screen-saver')
  popup!.show()
  popup!.focus()
  popup!.webContents.send('popup:activate', {
    screenshot,
    settings: getSettings(),
    apiKeyStatus,
    autoListen
  })
}

// Main hotkey: screenshot the current screen (or add another if already open).
async function onHotkey(): Promise<void> {
  if (popup && popup.isVisible()) {
    await addScreenshot()
  } else {
    await activatePopup()
  }
}

// Mic-only hotkey: open the popup WITHOUT a screenshot and start listening, or
// just start listening if it's already open. For voice questions with no screen.
async function onMicHotkey(): Promise<void> {
  if (popup && popup.isVisible()) {
    popup.webContents.send('popup:start-listen')
  } else {
    await activatePopup({ withScreenshot: false, autoListen: true })
  }
}

// Capture an additional screenshot and append it to the popup's stack,
// without clearing the current question/answer.
async function addScreenshot(): Promise<void> {
  if (!popup) return
  popup.hide()
  await new Promise((r) => setTimeout(r, 150))
  let screenshot: string | null = null
  try {
    screenshot = await captureScreen()
  } catch (err) {
    console.error('Screenshot failed:', err)
  }
  popup.showInactive()
  popup.setAlwaysOnTop(true, 'screen-saver')
  popup.show()
  popup.focus()
  if (screenshot) popup.webContents.send('popup:add-shot', { screenshot })
}

function openSettings(): void {
  if (settingsWin) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 720,
    title: 'DigiTutor Settings',
    icon: appIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  loadRenderer(settingsWin, 'settings')
}

// ---------- hotkey registration ----------

// ---------- launch at startup ----------

function applyLoginItem(enabled: boolean): void {
  // Only meaningful in a packaged build (dev would register the Electron binary).
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

// ---------- hotkey registration ----------

// Registers both the screenshot hotkey and the mic-only hotkey. Returns whether
// each one took. A mic hotkey equal to the main one is skipped (not an error).
function registerHotkeys(): { hotkeyOk: boolean; micOk: boolean } {
  globalShortcut.unregisterAll()
  const s = getSettings()
  let hotkeyOk = false
  let micOk = true
  try {
    hotkeyOk = globalShortcut.register(s.hotkey, () => void onHotkey())
  } catch {
    hotkeyOk = false
  }
  if (s.micHotkey && s.micHotkey !== s.hotkey) {
    try {
      micOk = globalShortcut.register(s.micHotkey, () => void onMicHotkey())
    } catch {
      micOk = false
    }
  }
  return { hotkeyOk, micOk }
}

// ---------- tray ----------

function buildTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('DigiTutor')
  refreshTrayMenu()
  tray.on('click', () => void onHotkey())
}

function refreshTrayMenu(): void {
  if (!tray) return
  const s = getSettings()
  const menu = Menu.buildFromTemplate([
    { label: `Ask DigiTutor  (${s.hotkey})`, click: () => void onHotkey() },
    { label: `Ask by voice only  (${s.micHotkey})`, click: () => void onMicHotkey() },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit DigiTutor', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

// ---------- IPC ----------

function registerIpc(): void {
  // Popup window controls.
  ipcMain.on('popup:hide', () => popup?.hide())
  ipcMain.on('popup:resize', (_e, height: number) => positionPopup(height))
  ipcMain.on('settings:open', openSettings)
  ipcMain.on('link:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  // Ask the AI. Streams chunks via 'ai:chunk'; resolves when complete.
  ipcMain.handle('ai:ask', async (event, payload: { messages: ChatMessage[] }) => {
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, error: 'no-key' }

    currentAbort?.abort()
    currentAbort = new AbortController()
    const settings = getSettings()
    try {
      const result = await ask(
        settings,
        apiKey,
        payload.messages ?? [],
        (text) => event.sender.send('ai:chunk', text),
        currentAbort.signal
      )
      return { ok: true, text: result.text }
    } catch (err) {
      if (currentAbort?.signal.aborted) return { ok: false, error: 'aborted' }
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('ai:cancel', () => {
    currentAbort?.abort()
    return true
  })

  // Settings.
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, partial: Partial<Settings>) => {
    const before = getSettings()
    const after = saveSettings(partial)
    if (after.launchAtStartup !== before.launchAtStartup) {
      applyLoginItem(after.launchAtStartup)
    }
    if (after.hotkey !== before.hotkey || after.micHotkey !== before.micHotkey) {
      const { hotkeyOk } = registerHotkeys()
      if (!hotkeyOk) {
        // Revert to the previous (working) main hotkey on failure.
        saveSettings({ hotkey: before.hotkey })
        registerHotkeys()
        refreshTrayMenu()
        return { settings: getSettings(), hotkeyError: true }
      }
    }
    refreshTrayMenu()
    return { settings: after, hotkeyError: false }
  })
  ipcMain.handle('settings:apikey-status', () => getApiKeyStatus())
  ipcMain.handle('settings:apikey-set', (_e, key: string) => setApiKey(key))
}

// ---------- app lifecycle ----------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => void onHotkey())

  app.whenReady().then(() => {
    // Allow microphone/media access for our windows (used by speech features).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'media')
    })

    if (process.platform === 'win32') app.setAppUserModelId('com.digitutor.app')

    registerIpc()
    buildTray()
    createPopup()
    const { hotkeyOk } = registerHotkeys()
    if (!hotkeyOk) console.warn('Failed to register hotkey:', getSettings().hotkey)
    applyLoginItem(getSettings().launchAtStartup)
  })

  // Tray app: keep running even when every window is closed/hidden.
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => globalShortcut.unregisterAll())
}
