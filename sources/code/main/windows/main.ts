import { appInfo, getBuildInfo } from "../modules/client";
import { AppConfig, WinStateKeeper } from "../modules/config";
import { app, BrowserWindow, Tray, net, ipcMain, desktopCapturer, BrowserView } from "electron/main";
import { nativeImage } from "electron/common";
import * as getMenu from '../modules/menu';
import { discordFavicons, knownInstancesList } from '../../common/global';
import packageJson from '../../common/modules/package';
import { discordContentSecurityPolicy } from '../modules/csp';
import type l10n from "../../common/modules/l10n";
import { createHash } from 'crypto';
import { resolve } from "path";
import colors from '@spacingbat3/kolor';
import { loadChromiumExtensions, loadStyles } from "../modules/extensions";
import { commonCatches } from "../modules/error";

const configData = new AppConfig();

export default function createMainWindow(startHidden: boolean, l10nStrings: l10n["client"]): BrowserWindow {

    // Some variable declarations

    let tray: Tray;

    // Check the window state

    const mainWindowState = new WinStateKeeper('mainWindow');

    // Browser window

    const win = new BrowserWindow({
        title: app.getName(),
        minWidth: appInfo.minWinWidth,
        minHeight: appInfo.minWinHeight,
        height: mainWindowState.initState.height,
        width: mainWindowState.initState.width,
        backgroundColor: appInfo.backgroundColor,
        icon: appInfo.icon,
        show: false,
        webPreferences: {
            preload: app.getAppPath() + "/sources/app/renderer/preload/main.js",
            nodeIntegration: false,
            devTools: true, // Too usefull to be blocked.
            defaultFontFamily: {
                standard: 'Arial' // `sans-serif` as default font.
            }
        }
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        if (errorCode <= -100 && errorCode >= -199)
            // Show offline page on connection errors.
            void win.loadFile(resolve(app.getAppPath(), 'sources/assets/web/html/404.html'));
        else if (errorCode === -30) {
            // Ignore CSP errors.
            console.warn(colors.bold('[WARN]')+' A page "'+validatedURL+'" was blocked by CSP.')
            return;
        }
        console.error(colors.bold('[ERROR]')+' '+errorDescription+' ('+(errorCode*-1).toString()+')');
        const retry = setInterval(() => {
            if (retry && net.isOnline()) {
                clearInterval(retry);
                void win.loadURL(knownInstancesList[new AppConfig().get().currentInstance][1].href);
            }
        }, 1000);
    });
    win.webContents.once('did-finish-load', () => {
        console.debug("[PAGE] Starting to load the Discord page...")
        if (!startHidden) win.show();
        setTimeout(() => {void win.loadURL(knownInstancesList[new AppConfig().get().currentInstance][1].href)}, 1500);
    });
    if (mainWindowState.initState.isMaximized) win.maximize();

    // CSP

    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        let headersOverwrite:{'Content-Security-Policy':string[]}|undefined = undefined;
        if (configData.get().csp.enabled) {
            console.debug("[CSP] Overwritting Discord CSP.");
            headersOverwrite = {
                'Content-Security-Policy': [discordContentSecurityPolicy]
            }
        }
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                ...headersOverwrite
            }
        });
    });

    win.webContents.session.webRequest.onBeforeRequest(
        {
            urls: [
                'https://*/api/*/science',
                'https://*/api/*/channels/*/typing',
                'https://*/api/*/track'
            ]
        },
        (details, callback) => {

            const configData = (new AppConfig()).get();
            const cancel = configData.blockApi.science || configData.blockApi.typingIndicator;
            const url = new URL(details.url);

            if (cancel) console.debug('[API] Blocking ' + url.pathname);

            if (url.pathname.endsWith('/science') || url.pathname.endsWith('/track'))
                callback({ cancel: configData.blockApi.science });
            else if (url.pathname.endsWith('/typing'))
                callback({ cancel: configData.blockApi.typingIndicator });
            else
                callback({ cancel: false });

        },
    );
    // (Device) permissions check/request handlers:
    {
        /** List of domains, urls or protocols accepted by permission handlers. */
        const trustedURLs = [
            knownInstancesList[new AppConfig().get().currentInstance][1].origin,
            'devtools://'
        ];
        const permissionHandler = function (webContentsUrl:string, permission:string, details:Electron.PermissionRequestHandlerHandlerDetails|Electron.PermissionCheckHandlerHandlerDetails):boolean|null {
            for (const secureURL of trustedURLs) {
                if (new URL(webContentsUrl).origin !== new URL(secureURL).origin) {
                    return false;
                }
                switch (permission) {
                    case "media":{
                        let callbackValue = true;
                        if("mediaTypes" in details) {
                            if(details.mediaTypes === undefined) break;
                            for(const type of details.mediaTypes)
                                callbackValue = callbackValue && configData.get().permissions[type];
                        } else if("mediaType" in details) {
                            if(details.mediaType === undefined || details.mediaType === "unknown") break;
                            callbackValue = callbackValue && configData.get().permissions[details.mediaType];
                        } else {
                            callbackValue = false;
                        }
                        return callbackValue;
                    }
                    case "display-capture":
                    case "notifications":
                    case "fullscreen":
                        return configData.get().permissions[permission];
                    default:
                        return false;
                }
            }
            return null;
        }
        win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
            const requestUrl = (webContents !== null && webContents.getURL() !== "" ? webContents.getURL() : requestingOrigin);
            const returnValue = permissionHandler(requestUrl,permission,details);
            if(returnValue === null) {
                console.warn(`[${l10nStrings.dialog.common.warning.toLocaleUpperCase()}] ${l10nStrings.dialog.permission.check.denied}`, new URL(requestUrl), permission);
                return false;
            }
            return returnValue;
        });
        win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
            const returnValue = permissionHandler(webContents.getURL(), permission, details);
            if(returnValue === null) {
                console.warn('[' + l10nStrings.dialog.common.warning.toLocaleUpperCase() + '] ' + l10nStrings.dialog.permission.request.denied, webContents.getURL(), permission);
                return callback(false);
            }
            return callback(returnValue);
        });
    }
    void win.loadFile(resolve(app.getAppPath(), 'sources/assets/web/html/load.html'));
    win.setAutoHideMenuBar(configData.get().hideMenuBar);
    win.setMenuBarVisibility(!configData.get().hideMenuBar);
    // Add English to the spellchecker
    {
        let valid = true;
        const spellCheckerLanguages = [app.getLocale(), 'en-US'];
        if (app.getLocale() === 'en-US') valid = false;
        if (valid && process.platform !== 'darwin')
            for (const language of spellCheckerLanguages)
                if (!win.webContents.session.availableSpellCheckerLanguages.includes(language))
                    valid = false;
        if (valid) win.webContents.session.setSpellCheckerLanguages(spellCheckerLanguages);
    }

    // Keep window state

    mainWindowState.watchState(win);

    // Load all menus:

    getMenu.context(win);
    if (!configData.get().disableTray) tray = getMenu.tray(win);
    getMenu.bar(packageJson.data.repository.url, win);

    // "Red dot" icon feature
    let setFavicon: string | undefined;
    win.webContents.on('page-favicon-updated', (_event, favicons) => {
        const t = tray;
        // Convert from DataURL to RAW.
        const faviconRaw = nativeImage.createFromDataURL(favicons[0]??"").toBitmap();
        // Hash discord favicon.
        const faviconHash = createHash('sha1').update(faviconRaw).digest('hex');
        // Stop execution when icon is same as the one set.
        if (faviconHash === setFavicon) return;
        // Stop code execution on Fosscord instances.
        if (new URL(win.webContents.getURL()).origin !== knownInstancesList[0][1].origin) {
            setFavicon = faviconHash;
            t.setImage(appInfo.trayIcon);
            win.flashFrame(false);
            return;
        }

        // Compare hashes.
        if (!configData.get().disableTray) {
            if(faviconHash === discordFavicons.default) {
                t.setImage(appInfo.trayIcon);
                win.flashFrame(false);
            } else if(faviconHash.startsWith('4')) {
                t.setImage(appInfo.trayUnread);
                win.flashFrame(false);
            } else {
                console.debug("[Mention] Hash: "+faviconHash)
                t.setImage(appInfo.trayPing);
                win.flashFrame(true);
            }
            setFavicon = faviconHash;
        }
    });

    // Window Title
    win.on('page-title-updated', (event, title) => {
        event.preventDefault();
        if (title.includes("Discord Test Client"))
            win.setTitle(app.getName() + " (Fosscord)")
        else if (title.includes("Discord") && !/[0-9]+/.test(win.webContents.getURL()))
            win.setTitle(title.replace("Discord",app.getName()));
        else
            win.setTitle(app.getName() + ' - ' + title);
    });

    /* Expose "did-stop-loading" event to preloads, it seems to be the most
     * precise way of watching for the changes within Discord's DOM.
     */
    ipcMain.on("cosmetic.load", (event) => {
        const callback = () => {
            if(!win.webContents.getURL().startsWith("https:")) return;
            console.debug("[IPC] Exposing a 'did-stop-loading' event...");
            event.reply("webContents.did-stop-loading");
        }
        win.webContents.once("did-stop-loading", callback);
        win.webContents.once("did-navigate", () => {
            win.webContents.removeListener("did-stop-loading", callback);
        });
    });

    ipcMain.on("cosmetic.hideElementByClass", (event, cssRule:string) => {
        void win.webContents.insertCSS(cssRule+':nth-last-child(2) > *, '+cssRule+':nth-last-child(3) > * { display:none; }')
        event.reply("cosmetic.hideElementByClass");
    })

    // Animate menu
    ipcMain.on('cosmetic.sideBarClass', (_event, className:string) => {
        console.debug("[CSS] Injecting a CSS for sidebar animation...")
        void win.webContents.insertCSS("."+className+"{ transition: width .1s cubic-bezier(0.4, 0, 0.2, 1);}")
    });

    // Insert custom css styles:

    win.webContents.on('did-finish-load', () => {
        if(new URL(win.webContents.getURL()).protocol === "https:") {
            loadStyles(win.webContents)
                .catch(commonCatches.print);
        }
    });

    // Inject desktop capturer
    ipcMain.on('api-exposed', (_event, api:string) => {
        console.debug("[IPC] Exposing a `getDisplayMedia` and spoffing it as native method.")
        const functionString = `
            navigator.mediaDevices.getDisplayMedia = Function.prototype.call.apply(Function.prototype.bind, [async() => navigator.mediaDevices.getUserMedia(await window['${api.replaceAll("'","\\'")}']())]);
        `;
        win.webContents.executeJavaScript(functionString + ';0').catch(commonCatches.throw);
    });

    // Apply settings that doesn't need app restart on change
    ipcMain.on('settings-config-modified', (_event, object:Record<string,unknown>) => {
        const config = new AppConfig();
        // Menu bar
        if ("hideMenuBar" in object) {
            console.debug("[Settings] Updating menu bar state...")
            win.setAutoHideMenuBar(config.get().hideMenuBar);
            win.setMenuBarVisibility(!config.get().hideMenuBar);
        }
        // Custom Discord instance switch
        if("currentInstance" in object) {
            void win.loadURL(knownInstancesList[config.get().currentInstance][1].href)
        }
    });

    // Load extensions for builds of type "devel".
    if(getBuildInfo().type === "devel")
        void loadChromiumExtensions(win.webContents.session)
    
    // WebSocket server
    import('../modules/socket').then((socket) => socket.default(win)).catch(e => {console.error(e)});

    // Handle desktopCapturer functionality through experimental BrowserViews
    {
        /** Determines whenever another request is in process. */
        let lock = false;
        ipcMain.handle("desktopCapturerRequest", () => {
            return new Promise((resolvePromise) => {
                // Handle lock and check for a presence of another BrowserView.
                if(lock || win.getBrowserViews().length !== 0)
                    return new Error("Main process is busy by another request.")
                // Fail when client has denied the permission to the capturer.
                if(!configData.get().permissions["display-capture"])
                    return new Error("Permission denied.")
                lock = true;
                const sources = desktopCapturer.getSources({
                    types: ["screen", "window"],
                    fetchWindowIcons: true
                });
                const view = new BrowserView({
                    webPreferences: {
                        preload: resolve(app.getAppPath(), "sources/app/renderer/preload/capturer.js")
                    }
                });
                ipcMain.handleOnce("getDesktopCapturerSources", (event) => {
                    if(event.sender === view.webContents)
                        return sources;
                    else
                        return null;
                });
                const autoResize = () => setImmediate(() => view.setBounds({
                    ...win.getBounds(),
                    x:0,
                    y:0,
                }));
                ipcMain.once("closeCapturerView", (_event,data:unknown) => {
                    win.removeBrowserView(view);
                    view.webContents.delete();
                    win.removeListener("resize", autoResize);
                    resolvePromise(data);
                    lock = false;
                })
                win.setBrowserView(view);
                void view.webContents.loadFile(resolve(app.getAppPath(), "sources/assets/web/html/capturer.html"));
                view.webContents.once("did-finish-load", () => {
                    autoResize();
                    win.on("resize", autoResize);
                })
                return;
            });
        });
    }
    return win;
}