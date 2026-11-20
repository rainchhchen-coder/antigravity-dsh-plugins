<#
.SYNOPSIS
  Antigravity Gemini 娘桌面透明悬浮宠（Windows 原生 WPF 无边框透明置顶版）
.DESCRIPTION
  灵感源自 PC2005-cloud/dsh-pet。
  零侵入、不修改 Antigravity 任何文件、严格 0 额外 Token 消耗：
  - 纯透明背景、无边框，直接趴在 Antigravity 窗口右下角并自动跟随移动
  - 支持左键拖拽、点击摸头 QQ 弹弹 + 气泡台词、呼吸浮动动画
  - 自动只读本地 transcript.jsonl 尾部 8KB，实时联动思考/写代码/待机/低电量状态
#>

$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

# Win32 窗口追踪（自动查找 Antigravity 主窗口）
$win32 = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WindowTracker {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static bool TryGetAntigravityRect(out RECT bestRect, out bool isMinimized) {
        bestRect = new RECT();
        isMinimized = false;
        IntPtr found = IntPtr.Zero;
        int bestArea = 0;
        RECT foundRect = new RECT();
        bool foundMin = false;

        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString();
            if (string.IsNullOrEmpty(title)) return true;
            if (title.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0 &&
                title.IndexOf("GeminiPetOverlay", StringComparison.OrdinalIgnoreCase) < 0) {
                bool min = IsIconic(hWnd);
                RECT r;
                if (GetWindowRect(hWnd, out r)) {
                    int area = Math.Max(0, r.Right - r.Left) * Math.Max(0, r.Bottom - r.Top);
                    if (min || area > bestArea) {
                        bestArea = area;
                        found = hWnd;
                        foundRect = r;
                        foundMin = min;
                    }
                }
            }
            return true;
        }, IntPtr.Zero);

        if (found != IntPtr.Zero) {
            bestRect = foundRect;
            isMinimized = foundMin;
            return true;
        }
        return false;
    }
}
"@
Add-Type -TypeDefinition $win32

$spriteDir = Join-Path $PSScriptRoot "sprites"
$script:SpritePaths = @{
    idle     = Join-Path $spriteDir "gemini_idle.png"
    thinking = Join-Path $spriteDir "gemini_thinking.png"
    coding   = Join-Path $spriteDir "gemini_coding.png"
    sleepy   = Join-Path $spriteDir "gemini_idle.png"
}

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="GeminiPetOverlay"
        Width="230" Height="270"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="False"
        ResizeMode="NoResize">
    <Grid>
        <!-- 对话气泡 -->
        <Border x:Name="BubbleBorder"
                VerticalAlignment="Top"
                HorizontalAlignment="Center"
                Margin="6,2,6,0"
                Padding="10,6"
                CornerRadius="14"
                Background="#EE1E1B4B"
                BorderBrush="#AA8B5CF6"
                BorderThickness="1.2"
                Opacity="0"
                IsHitTestVisible="False">
            <Border.Effect>
                <DropShadowEffect BlurRadius="12" ShadowDepth="2" Opacity="0.35" Color="#000000"/>
            </Border.Effect>
            <TextBlock x:Name="BubbleText"
                       Text="哈基米已趴在右下角待命啦✨"
                       Foreground="#F5F3FF"
                       FontFamily="Microsoft YaHei UI, Segoe UI"
                       FontSize="12"
                       TextWrapping="Wrap"
                       MaxWidth="196"
                       TextAlignment="Center"/>
        </Border>

        <!-- 角色立绘容器 -->
        <Grid x:Name="PetContainer"
              VerticalAlignment="Bottom"
              HorizontalAlignment="Center"
              Width="188" Height="188"
              Margin="0,0,0,6"
              RenderTransformOrigin="0.5,0.85"
              Cursor="Hand">
            <Grid.RenderTransform>
                <TransformGroup>
                    <ScaleTransform x:Name="PetScale" ScaleX="1" ScaleY="1"/>
                    <TranslateTransform x:Name="PetTranslate" X="0" Y="0"/>
                </TransformGroup>
            </Grid.RenderTransform>

            <Image x:Name="PetImage"
                   Stretch="Uniform"
                   RenderOptions.BitmapScalingMode="HighQuality">
                <Image.Effect>
                    <DropShadowEffect BlurRadius="16" ShadowDepth="3" Opacity="0.32" Color="#3B0764"/>
                </Image.Effect>
            </Image>

            <!-- 状态小徽章 -->
            <Border x:Name="StateBadge"
                    VerticalAlignment="Bottom"
                    HorizontalAlignment="Right"
                    Margin="0,0,8,4"
                    Padding="6,2"
                    CornerRadius="9"
                    Background="#CC6D28D9"
                    Opacity="0.9">
                <TextBlock x:Name="StateBadgeText"
                           Text="✨ 待机"
                           Foreground="#FFFFFF"
                           FontFamily="Microsoft YaHei UI, Segoe UI"
                           FontSize="10"
                           FontWeight="SemiBold"/>
            </Border>
        </Grid>
    </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

$petImage       = $window.FindName("PetImage")
$petContainer   = $window.FindName("PetContainer")
$petScale       = $window.FindName("PetScale")
$petTranslate   = $window.FindName("PetTranslate")
$bubbleBorder   = $window.FindName("BubbleBorder")
$bubbleText     = $window.FindName("BubbleText")
$stateBadgeText = $window.FindName("StateBadgeText")

$script:CurrentState = "idle"
$script:AutoDock     = $true
$script:AutoSync     = $true
$script:IsDragging   = $false
$script:DragMoved    = $false
$script:MouseDownPt  = $null

$script:Quotes = @{
    pat      = @(
        "喵呜～再摸耳朵要炸毛啦！(⁄ ⁄•⁄ω⁄•⁄ ⁄)",
        "被夸奖了，多模态能量+100%✨",
        "本哈基米可是 0 Token 消耗的乖巧桌宠！",
        "放心写代码，右下角有我守着呢💖"
    )
    thinking = @("耳朵听着呢～高速思考中✨", "嗯哼，正在为你分析最优方案…")
    coding   = @("哒哒哒！全速敲代码中⚡", "工具调用中，马上搞定！")
    sleepy   = @("电量偏低…好困哦…Zzz", "好久没动静啦，我先打个盹～")
    idle     = @("搞定啦！随时待命✨", "点我可以摸头，右键可以切换姿势哦～")
}

function Load-Bitmap([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    $bmp = New-Object System.Windows.Media.Imaging.BitmapImage
    $bmp.BeginInit()
    $bmp.UriSource = New-Object System.Uri($path, [System.UriKind]::Absolute)
    $bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $bmp.EndInit()
    $bmp.Freeze()
    return $bmp
}

$script:Bitmaps = @{
    idle     = Load-Bitmap $script:SpritePaths.idle
    thinking = Load-Bitmap $script:SpritePaths.thinking
    coding   = Load-Bitmap $script:SpritePaths.coding
    sleepy   = Load-Bitmap $script:SpritePaths.sleepy
}

$script:BubbleHideTimer = New-Object System.Windows.Threading.DispatcherTimer
$script:BubbleHideTimer.Interval = [TimeSpan]::FromSeconds(3.2)
$script:BubbleHideTimer.Add_Tick({
    $script:BubbleHideTimer.Stop()
    $anim = New-Object System.Windows.Media.Animation.DoubleAnimation(0.0, [TimeSpan]::FromMilliseconds(350))
    $bubbleBorder.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $anim)
})

function Show-Bubble([string]$text) {
    $bubbleText.Text = $text
    $anim = New-Object System.Windows.Media.Animation.DoubleAnimation(1.0, [TimeSpan]::FromMilliseconds(180))
    $bubbleBorder.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $anim)
    $script:BubbleHideTimer.Stop()
    $script:BubbleHideTimer.Start()
}

function Play-Squish {
    $sx = New-Object System.Windows.Media.Animation.DoubleAnimationUsingKeyFrames
    $sx.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(1.16, [TimeSpan]::FromMilliseconds(90)))) | Out-Null
    $sx.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(0.92, [TimeSpan]::FromMilliseconds(210)))) | Out-Null
    $sx.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(1.03, [TimeSpan]::FromMilliseconds(310)))) | Out-Null
    $sx.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(1.00, [TimeSpan]::FromMilliseconds(400)))) | Out-Null

    $sy = New-Object System.Windows.Media.Animation.DoubleAnimationUsingKeyFrames
    $sy.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(0.84, [TimeSpan]::FromMilliseconds(90)))) | Out-Null
    $sy.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(1.10, [TimeSpan]::FromMilliseconds(210)))) | Out-Null
    $sy.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(0.97, [TimeSpan]::FromMilliseconds(310)))) | Out-Null
    $sy.KeyFrames.Add((New-Object System.Windows.Media.Animation.LinearDoubleKeyFrame(1.00, [TimeSpan]::FromMilliseconds(400)))) | Out-Null

    $petScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $sx)
    $petScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $sy)
}

function Set-PetState([string]$state, [bool]$announce = $false) {
    $script:CurrentState = $state
    if ($script:Bitmaps[$state]) { $petImage.Source = $script:Bitmaps[$state] }
    switch ($state) {
        "thinking" { $stateBadgeText.Text = "💭 听着呢"; $petImage.Opacity = 1.0 }
        "coding"   { $stateBadgeText.Text = "⚡ 敲代码"; $petImage.Opacity = 1.0 }
        "sleepy"   { $stateBadgeText.Text = "💤 低电量"; $petImage.Opacity = 0.88 }
        default    { $stateBadgeText.Text = "✨ 待机";   $petImage.Opacity = 1.0 }
    }
    if ($announce) {
        $list = $script:Quotes[$state]
        if ($list) { Show-Bubble ($list | Get-Random) }
        Play-Squish
    }
}

# 读取 Antigravity 本地 transcript.jsonl 尾部（纯只读，0 Token 消耗）
function Detect-AntigravityState {
    $brainDir = Join-Path $env:USERPROFILE ".gemini\antigravity\brain"
    if (-not (Test-Path $brainDir)) { return "idle" }
    $latestFile = $null
    $latestTime = [DateTime]::MinValue
    foreach ($d in Get-ChildItem -Directory $brainDir) {
        $log = Join-Path $d.FullName ".system_generated\logs\transcript.jsonl"
        if (Test-Path $log) {
            $fi = Get-Item $log
            if ($fi.LastWriteTimeUtc -gt $latestTime) {
                $latestTime = $fi.LastWriteTimeUtc
                $latestFile = $fi
            }
        }
    }
    if (-not $latestFile) { return "idle" }
    $ageSec = ([DateTime]::UtcNow - $latestFile.LastWriteTimeUtc).TotalSeconds
    if ($ageSec -gt 180) { return "sleepy" }
    if ($ageSec -gt 28)  { return "idle" }

    try {
        $fs = [System.IO.File]::Open($latestFile.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $len = [Math]::Min($fs.Length, 8192L)
        $fs.Seek(-$len, [System.IO.SeekOrigin]::End) | Out-Null
        $buf = New-Object byte[] $len
        $read = $fs.Read($buf, 0, $len)
        $fs.Close()
        $tail = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
        $lines = $tail -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }
        for ($i = $lines.Length - 1; $i -ge 0; $i--) {
            try {
                $obj = $lines[$i] | ConvertFrom-Json
                if ($obj.tool_calls -and $obj.tool_calls.Count -gt 0) { return "coding" }
                if ($obj.type -eq "USER_INPUT" -or $obj.thinking) { return "thinking" }
                break
            } catch {}
        }
    } catch {}
    return "idle"
}

# 呼吸浮动动画
$floatAnim = New-Object System.Windows.Media.Animation.DoubleAnimation(0, -6, [TimeSpan]::FromSeconds(1.8))
$floatAnim.AutoReverse = $true
$floatAnim.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
$floatAnim.EasingFunction = New-Object System.Windows.Media.Animation.SineEase
$petTranslate.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $floatAnim)

# 左键点击摸头 & 拖拽
$petContainer.Add_MouseLeftButtonDown({
    param($s, $e)
    $script:IsDragging = $true
    $script:DragMoved = $false
    $script:MouseDownPt = $e.GetPosition($window)
    $startLeft = $window.Left
    $startTop  = $window.Top
    $window.DragMove()
    $script:IsDragging = $false
    if ([Math]::Abs($window.Left - $startLeft) -gt 4 -or [Math]::Abs($window.Top - $startTop) -gt 4) {
        $script:AutoDock = $false
        $menuAutoDock.IsChecked = $false
        Show-Bubble "已切换到自由停靠模式～右键可恢复吸附 Antigravity"
    } else {
        Play-Squish
        Show-Bubble ($script:Quotes.pat | Get-Random)
    }
})

# 右键菜单
$ctx = New-Object System.Windows.Controls.ContextMenu

$mPat = New-Object System.Windows.Controls.MenuItem -Property @{ Header = "👋 摸摸头" }
$mPat.Add_Click({ Play-Squish; Show-Bubble ($script:Quotes.pat | Get-Random) })

$menuAutoDock = New-Object System.Windows.Controls.MenuItem -Property @{ Header = "🧲 自动吸附 Antigravity 右下角"; IsCheckable = $true; IsChecked = $true }
$menuAutoDock.Add_Click({
    $script:AutoDock = $menuAutoDock.IsChecked
    if ($script:AutoDock) { Show-Bubble "已重新吸附到 Antigravity 右下角✨" }
})

$menuAutoSync = New-Object System.Windows.Controls.MenuItem -Property @{ Header = "🔄 自动同步 Agent 状态 (0 Token)"; IsCheckable = $true; IsChecked = $true }
$menuAutoSync.Add_Click({ $script:AutoSync = $menuAutoSync.IsChecked })

$mStates = New-Object System.Windows.Controls.MenuItem -Property @{ Header = "🎭 手动切换姿势" }
foreach ($pair in @(
    @("✨ 待机", "idle"),
    @("💭 耳朵听着呢", "thinking"),
    @("⚡ 敲代码中", "coding"),
    @("💤 低电量打盹", "sleepy")
)) {
    $mi = New-Object System.Windows.Controls.MenuItem -Property @{ Header = $pair[0]; Tag = $pair[1] }
    $mi.Add_Click({
        param($sender, $args)
        $script:AutoSync = $false
        $menuAutoSync.IsChecked = $false
        Set-PetState $sender.Tag $true
    })
    $mStates.Items.Add($mi) | Out-Null
}

$mSize = New-Object System.Windows.Controls.MenuItem -Property @{ Header = "📐 调整大小" }
foreach ($sz in @(@("小 (145px)", 145), @("中 (188px)", 188), @("大 (230px)", 230))) {
    $mi = New-Object System.Windows.Controls.MenuItem -Property @{ Header = $sz[0]; Tag = $sz[1] }
    $mi.Add_Click({
        param($sender, $args)
        $v = [int]$sender.Tag
        $petContainer.Width = $v
        $petContainer.Height = $v
        $window.Width = $v + 42
        $window.Height = $v + 82
    })
    $mSize.Items.Add($mi) | Out-Null
}

$mExit = New-Object System.Windows.Controls.MenuItem -Property @{ Header = "❌ 退出 Gemini 娘桌宠" }
$mExit.Add_Click({ $window.Close() })

$ctx.Items.Add($mPat) | Out-Null
$ctx.Items.Add($menuAutoDock) | Out-Null
$ctx.Items.Add($menuAutoSync) | Out-Null
$ctx.Items.Add((New-Object System.Windows.Controls.Separator)) | Out-Null
$ctx.Items.Add($mStates) | Out-Null
$ctx.Items.Add($mSize) | Out-Null
$ctx.Items.Add((New-Object System.Windows.Controls.Separator)) | Out-Null
$ctx.Items.Add($mExit) | Out-Null
$petContainer.ContextMenu = $ctx

# 定时追踪 Antigravity 窗口位置（500ms）
$dockTimer = New-Object System.Windows.Threading.DispatcherTimer
$dockTimer.Interval = [TimeSpan]::FromMilliseconds(450)
$dockTimer.Add_Tick({
    if (-not $script:AutoDock -or $script:IsDragging) { return }
    $rect = New-Object WindowTracker+RECT
    $isMin = $false
    $found = [WindowTracker]::TryGetAntigravityRect([ref]$rect, [ref]$isMin)
    if ($found) {
        if ($isMin) {
            if ($window.Visibility -eq [System.Windows.Visibility]::Visible) {
                $window.Visibility = [System.Windows.Visibility]::Hidden
            }
            return
        }
        if ($window.Visibility -ne [System.Windows.Visibility]::Visible) {
            $window.Visibility = [System.Windows.Visibility]::Visible
        }
        $src = [System.Windows.PresentationSource]::FromVisual($window)
        $scaleX = 1.0; $scaleY = 1.0
        if ($src -and $src.CompositionTarget) {
            $m = $src.CompositionTarget.TransformFromDevice
            $scaleX = $m.M11; $scaleY = $m.M22
        }
        $targetLeft = ($rect.Right * $scaleX) - $window.Width + 14
        $targetTop  = ($rect.Bottom * $scaleY) - $window.Height + 6
        $wa = [System.Windows.SystemParameters]::WorkArea
        $window.Left = [Math]::Max($wa.Left, [Math]::Min($wa.Right - $window.Width, $targetLeft))
        $window.Top  = [Math]::Max($wa.Top,  [Math]::Min($wa.Bottom - $window.Height, $targetTop))
    } else {
        # 未检测到 Antigravity 时停靠桌面右下角
        if ($window.Visibility -ne [System.Windows.Visibility]::Visible) {
            $window.Visibility = [System.Windows.Visibility]::Visible
        }
        $wa = [System.Windows.SystemParameters]::WorkArea
        $window.Left = $wa.Right - $window.Width - 10
        $window.Top  = $wa.Bottom - $window.Height - 6
    }
})

# 定时同步 Agent 状态（3 秒一次，仅读尾部 8KB）
$syncTimer = New-Object System.Windows.Threading.DispatcherTimer
$syncTimer.Interval = [TimeSpan]::FromSeconds(3)
$syncTimer.Add_Tick({
    if (-not $script:AutoSync) { return }
    $next = Detect-AntigravityState
    if ($next -ne $script:CurrentState) {
        Set-PetState $next $true
    }
})

$window.Add_Loaded({
    $wa = [System.Windows.SystemParameters]::WorkArea
    $window.Left = $wa.Right - $window.Width - 10
    $window.Top  = $wa.Bottom - $window.Height - 6
    Set-PetState "idle" $false
    Show-Bubble "哈基米上线啦！已自动吸附在右下角✨"
    Play-Squish
    $dockTimer.Start()
    $syncTimer.Start()
})

$window.ShowDialog() | Out-Null
