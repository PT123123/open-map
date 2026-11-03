// 开源地图 · 电脑版（Electron）
'use strict';
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const SMOKE = process.env.MAP_SMOKE === '1'; // 自动化冒烟测试模式（无窗口）

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '开源地图',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#dfe6ec',
    show: !SMOKE,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // 清空默认菜单，界面更干净
  Menu.setApplicationMenu(null);

  // 页面里的外部链接（如 OSM 版权页）用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (SMOKE) { console.error('SMOKE_FAIL', code, desc, url); app.exit(1); }
  });
  win.webContents.on('did-finish-load', () => {
    if (SMOKE) {
      console.log('SMOKE_OK');
      setTimeout(() => app.exit(0), 800);
    }
  });
  return win;
}

app.whenReady().then(() => {
  createWindow();
  if (SMOKE) setTimeout(() => { console.error('SMOKE_TIMEOUT'); app.exit(1); }, 10000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
