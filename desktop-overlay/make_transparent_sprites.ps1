$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$csharp = @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SpriteCutout {
    public static void RemoveWhiteBg(string srcPath, string dstPath, int maxSize = 280) {
        using (var raw = new Bitmap(srcPath))
        using (var bmp = new Bitmap(raw.Width, raw.Height, PixelFormat.Format32bppArgb)) {
            using (var g = Graphics.FromImage(bmp)) {
                g.DrawImage(raw, 0, 0, raw.Width, raw.Height);
            }
            int w = bmp.Width, h = bmp.Height;
            var rect = new Rectangle(0, 0, w, h);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int bytes = Math.Abs(data.Stride) * h;
            byte[] px = new byte[bytes];
            Marshal.Copy(data.Scan0, px, 0, bytes);

            bool[] visited = new bool[w * h];
            bool[] isBg = new bool[w * h];
            var q = new Queue<int>();

            Func<int, bool> isNearWhite = (idx) => {
                int o = idx * 4;
                int b = px[o], g2 = px[o + 1], r = px[o + 2];
                int minC = Math.Min(r, Math.Min(g2, b));
                int maxC = Math.Max(r, Math.Max(g2, b));
                return minC >= 228 && (maxC - minC) <= 24;
            };

            // 从四条边入队 BFS，只清除外部背景，保护角色内部白色区域
            for (int x = 0; x < w; x++) {
                int top = x, bot = (h - 1) * w + x;
                if (isNearWhite(top)) { visited[top] = true; q.Enqueue(top); }
                if (isNearWhite(bot)) { visited[bot] = true; q.Enqueue(bot); }
            }
            for (int y = 0; y < h; y++) {
                int l = y * w, r = y * w + (w - 1);
                if (!visited[l] && isNearWhite(l)) { visited[l] = true; q.Enqueue(l); }
                if (!visited[r] && isNearWhite(r)) { visited[r] = true; q.Enqueue(r); }
            }

            int[] dx = { 1, -1, 0, 0 };
            int[] dy = { 0, 0, 1, -1 };
            while (q.Count > 0) {
                int cur = q.Dequeue();
                isBg[cur] = true;
                int cx = cur % w, cy = cur / w;
                for (int d = 0; d < 4; d++) {
                    int nx = cx + dx[d], ny = cy + dy[d];
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    int ni = ny * w + nx;
                    if (!visited[ni] && isNearWhite(ni)) {
                        visited[ni] = true;
                        q.Enqueue(ni);
                    }
                }
            }

            int minX = w, minY = h, maxX = 0, maxY = 0;
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int idx = y * w + x;
                    int o = idx * 4;
                    if (isBg[idx]) {
                        px[o + 3] = 0;
                    } else {
                        // 对紧贴背景的 1px 亮边缘做轻度羽化，消除白边锯齿
                        bool touchBg = (x > 0 && isBg[idx - 1]) || (x < w - 1 && isBg[idx + 1]) ||
                                       (y > 0 && isBg[idx - w]) || (y < h - 1 && isBg[idx + w]);
                        if (touchBg) {
                            int lum = (px[o + 2] + px[o + 1] + px[o]) / 3;
                            if (lum > 205) {
                                int a = Math.Max(0, Math.Min(255, (245 - lum) * 6));
                                px[o + 3] = (byte)a;
                            }
                        }
                        if (px[o + 3] > 20) {
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
            }

            Marshal.Copy(px, 0, data.Scan0, bytes);
            bmp.UnlockBits(data);

            if (maxX <= minX || maxY <= minY) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
            int cw = maxX - minX + 1;
            int ch = maxY - minY + 1;
            double scale = Math.Min((double)maxSize / cw, (double)maxSize / ch);
            int nw = Math.Max(1, (int)Math.Round(cw * scale));
            int nh = Math.Max(1, (int)Math.Round(ch * scale));

            using (var outBmp = new Bitmap(nw, nh, PixelFormat.Format32bppArgb))
            using (var g = Graphics.FromImage(outBmp)) {
                g.CompositingQuality = CompositingQuality.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.DrawImage(bmp, new Rectangle(0, 0, nw, nh), new Rectangle(minX, minY, cw, ch), GraphicsUnit.Pixel);
                outBmp.Save(dstPath, ImageFormat.Png);
            }
        }
    }
}
"@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

$srcDir = Join-Path $PSScriptRoot "..\plugins\antigravity-gemini-pet\sidecars\gemini_pet\assets"
$dstDir = Join-Path $PSScriptRoot "sprites"
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null

foreach ($name in @("gemini_idle", "gemini_thinking", "gemini_coding")) {
    $src = Join-Path $srcDir "$name.jpg"
    $dst = Join-Path $dstDir "$name.png"
    [SpriteCutout]::RemoveWhiteBg($src, $dst, 260)
    Write-Host "[OK] Cutout generated: $dst"
}
