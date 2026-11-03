package com.ted.openmap;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * 开源地图 · 离线 APK 版
 * - 内置离线瓦片/公交/路网数据（assets）
 * - 资源更新：设置页经 AndroidBridge 下载到 app 专属外部目录 offline/，
 *   shouldInterceptRequest 对 appassets.local 域名优先返回 offline/ 文件（下载即生效，重启不需要）
 */
public class MainActivity extends Activity {

    private static final String VIRTUAL_HOST = "appassets.local";
    private static final String BUILD_VERSION = "3.1";

    private WebView webView;
    private File offlineDir;
    private final Map<String, String> progressMap = new HashMap<>(); // relPath -> "42" | "done" | "error:..."

    private String pendingOrigin;
    private GeolocationPermissions.Callback pendingCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        offlineDir = new File(getExternalFilesDir(null), "offline");
        if (!offlineDir.exists()) offlineDir.mkdirs();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setGeolocationEnabled(true);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 外链（房源原文等）交给系统浏览器；appassets.local 与本地文件继续用 WebView
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))
                        && !url.contains(VIRTUAL_HOST)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) { }
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (VIRTUAL_HOST.equals(u.getHost())) {
                    String path = u.getPath();
                    if (path != null && path.startsWith("/")) path = path.substring(1);
                    if (path != null && !path.isEmpty()) {
                        // 1) 优先：用户下载到 offline/ 的更新资源
                        File f = new File(offlineDir, path);
                        if (f.isFile()) return fileResponse(f);
                        // 2) 回退：APK 内置 assets
                        try {
                            InputStream is = getAssets().open(path);
                            return new WebResourceResponse(guessMime(path), null, is);
                        } catch (IOException ignored) { }
                    }
                }
                return null;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingOrigin = origin;
                    pendingCallback = callback;
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            }
        });

        setContentView(webView);
        webView.loadUrl("https://" + VIRTUAL_HOST + "/index.html");
    }

    private static String guessMime(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        switch (ext) {
            case "html": return "text/html";
            case "js": return "text/javascript";
            case "css": return "text/css";
            case "json": case "webmanifest": return "application/json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            default: return "application/octet-stream";
        }
    }

    private WebResourceResponse fileResponse(File f) {
        try {
            String mime = guessMime(f.getName());
            if ("application/octet-stream".equals(mime)) {
                String ext = f.getName().substring(f.getName().lastIndexOf('.') + 1).toLowerCase();
                String m2 = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                if (m2 != null) mime = m2;
            }
            return new WebResourceResponse(mime, null, new FileInputStream(f));
        } catch (IOException e) {
            return null;
        }
    }

    /** JS 桥：设置页的资源清单/下载/进度 */
    private class Bridge {

        @JavascriptInterface
        public String getBuildInfo() {
            return "{\"version\":\"" + BUILD_VERSION + "\",\"offlineDir\":\"" + offlineDir.getAbsolutePath() + "\"}";
        }

        @JavascriptInterface
        public String listOffline() {
            StringBuilder sb = new StringBuilder("[");
            listDir(offlineDir, "", sb);
            if (sb.charAt(sb.length() - 1) == ',') sb.setLength(sb.length() - 1);
            return sb.append("]").toString();
        }

        private void listDir(File dir, String prefix, StringBuilder sb) {
            File[] files = dir.listFiles();
            if (files == null) return;
            for (File f : files) {
                if (f.isDirectory()) listDir(f, prefix + f.getName() + "/", sb);
                else if (!f.getName().endsWith(".progress") && !f.getName().endsWith(".part")) {
                    sb.append("{\"path\":\"").append(prefix).append(f.getName())
                      .append("\",\"size\":").append(f.length())
                      .append(",\"mtime\":").append(f.lastModified()).append("},");
                }
            }
        }

        /** Java 端代取文本（绕过 WebView CORS，用于读 GitHub 的 latest.json） */
        @JavascriptInterface
        public String fetchText(String url) {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(12000);
                c.setReadTimeout(20000);
                c.setRequestProperty("User-Agent", "open-map-apk");
                java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                return sb.toString();
            } catch (Exception e) {
                return "{\"error\":\"" + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}";
            }
        }

        /** 后台线程下载 url → offline/<relPath>（.part 临时文件，完成后改名） */
        @JavascriptInterface
        public String startDownload(String url, String relPath) {
            String key = relPath;
            if (progressMap.containsKey(key) && !"done".equals(progressMap.get(key))
                    && !progressMap.get(key).startsWith("error")) {
                return "already";
            }
            progressMap.put(key, "0");
            final String fUrl = url, fRel = relPath;
            new Thread(() -> {
                File dest = new File(offlineDir, fRel);
                File part = new File(dest.getAbsolutePath() + ".part");
                try {
                    if (!dest.getParentFile().exists()) dest.getParentFile().mkdirs();
                    HttpURLConnection c = (HttpURLConnection) new URL(fUrl).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(60000);
                    long total = c.getContentLength();
                    InputStream is = c.getInputStream();
                    FileOutputStream os = new FileOutputStream(part);
                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n;
                    while ((n = is.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        progressMap.put(fRel, total > 0 ? String.valueOf(done * 100 / total) : String.valueOf(done / 1024) + "KB");
                    }
                    os.close(); is.close();
                    if (dest.exists()) dest.delete();
                    if (!part.renameTo(dest)) throw new IOException("rename failed");
                    progressMap.put(fRel, "done");
                } catch (Exception e) {
                    progressMap.put(fRel, "error:" + String.valueOf(e.getMessage()).replace("\"", "'"));
                    if (part.exists()) part.delete();
                }
            }, "dl-" + fRel).start();
            return "started";
        }

        @JavascriptInterface
        public String getProgress(String relPath) {
            String p = progressMap.get(relPath);
            return p == null ? "none" : p;
        }

        /** 解压 offline/ 下的 zip 到 offline/<destRelDir>/（transit-offline.zip 用） */
        @JavascriptInterface
        public String unzip(String zipRelPath, String destRelDir) {
            File zip = new File(offlineDir, zipRelPath);
            File dest = new File(offlineDir, destRelDir);
            try {
                if (!zip.isFile()) return "error:zip 不存在";
                if (!dest.exists()) dest.mkdirs();
                java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new FileInputStream(zip));
                byte[] buf = new byte[16384];
                java.util.zip.ZipEntry e;
                int count = 0;
                while ((e = zis.getNextEntry()) != null) {
                    if (e.isDirectory()) continue;
                    String name = e.getName();
                    // 防路径穿越
                    File out = new File(dest, name.replace("..", ""));
                    if (!out.getParentFile().exists()) out.getParentFile().mkdirs();
                    FileOutputStream os = new FileOutputStream(out);
                    int n;
                    while ((n = zis.read(buf)) > 0) os.write(buf, 0, n);
                    os.close();
                    count++;
                }
                zis.close();
                return "done:" + count;
            } catch (Exception e) {
                return "error:" + String.valueOf(e.getMessage()).replace("\"", "'");
            }
        }

        /** 解压 offline/ 下的 .gz 到 offline/<destRelPath>（roads.js.gz 用） */
        @JavascriptInterface
        public String gunzip(String gzRelPath, String destRelPath) {
            try {
                File src = new File(offlineDir, gzRelPath);
                File dest = new File(offlineDir, destRelPath);
                if (!src.isFile()) return "error:gz 不存在";
                if (!dest.getParentFile().exists()) dest.getParentFile().mkdirs();
                java.util.zip.GZIPInputStream gis = new java.util.zip.GZIPInputStream(new FileInputStream(src));
                FileOutputStream os = new FileOutputStream(dest);
                byte[] buf = new byte[16384];
                int n;
                while ((n = gis.read(buf)) > 0) os.write(buf, 0, n);
                os.close(); gis.close();
                return "done:" + dest.length();
            } catch (Exception e) {
                return "error:" + String.valueOf(e.getMessage()).replace("\"", "'");
            }
        }

        /** 用系统浏览器打开 URL（下载兜底） */
        @JavascriptInterface
        public void openInBrowser(String url) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) { }
        }
    }

    private static final int REQ_LOCATION = 1;

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION && pendingCallback != null) {
            boolean granted = false;
            for (int r : grantResults) {
                if (r == PackageManager.PERMISSION_GRANTED) { granted = true; break; }
            }
            pendingCallback.invoke(pendingOrigin, granted, false);
            pendingOrigin = null;
            pendingCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
