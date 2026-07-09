# 08-dump-flv：输出 FLV 元数据

## 功能概述

分析 FLV 视频文件的结构，提取并输出元数据信息（编码格式、分辨率、时长、关键帧位置等）到标准输出。

## 命令用法

```bash
biliup dump-flv <FILE_NAME>
biliup dump-flv --help
```

### 参数详解

| 参数 | 类型 | 说明 |
|------|------|------|
| `FILE_NAME` | `String` | FLV 文件路径 |

## 源码分析

### 模块位置

- **文件**：`crates/biliup-cli/src/uploader.rs` 及以上层
- **功能**：解析 FLV 二进制文件格式，提取元数据并输出 JSON

## FLV 文件格式简介

FLV (Flash Video) 是 Adobe 的流媒体容器格式，B站 直播经常使用此格式。

```
FLV 文件结构:
┌─────────────────────┐
│   FLV Header        │  → 签名 "FLV", 版本, 类型标记
├─────────────────────┤
│   FLV Body          │
│  ┌───────────────┐  │
│  │ PreviousTagSize │ │
│  │ Tag (音频/视频)  │ │
│  │ ...             │ │
│  └───────────────┘  │
└─────────────────────┘
```

### FLV Header (9 字节)

| 偏移 | 大小 | 说明 |
|------|------|------|
| 0 | 3 | 签名: `FLV` (0x46 0x4C 0x56) |
| 3 | 1 | 版本: `0x01` |
| 4 | 1 | 类型标记: bit0=视频, bit2=音频 |
| 5 | 4 | DataOffset: header 大小 (通常 9) |

### FLV Tag

| 字段 | 大小 | 说明 |
|------|------|------|
| TagType | 1 | 8=音频, 9=视频, 18=脚本数据 |
| DataSize | 3 | 数据体大小 |
| Timestamp | 4 | 时间戳 (毫秒) |
| StreamID | 3 | 流ID (通常 0) |
| Data | N | 音频/视频/脚本数据 |

## 关键设计

### 1. 二进制解析

`dump-flv` 命令直接读取文件二进制数据，手动解析 FLV 容器格式：

```rust
// 伪代码：解析 FLV 头部
fn parse_flv_header(file: &mut File) -> Result<FlvHeader, Error> {
    let mut buf = [0u8; 9];
    file.read_exact(&mut buf)?;
    
    // 验证 FLV 签名
    if &buf[0..3] != b"FLV" {
        return Err(Error::InvalidFormat);
    }
    
    Ok(FlvHeader {
        version: buf[3],
        has_video: (buf[4] & 0x01) != 0,
        has_audio: (buf[4] & 0x04) != 0,
        data_offset: u32::from_be_bytes([0, buf[5], buf[6], buf[7]]),
    })
}
```

### 2. 元数据提取

解析脚本数据 Tag (type=18) 中的 onMetaData 信息：

```rust
// 元数据包含的关键字段
struct FlvMetadata {
    duration: f64,           // 时长（秒）
    width: f64,              // 视频宽度
    height: f64,             // 视频高度
    videodatarate: f64,      // 视频码率 (kbps)
    framerate: f64,          // 帧率 (fps)
    videocodecid: f64,       // 视频编码 ID
    audiodatarate: f64,      // 音频码率
    audiosamplerate: f64,    // 音频采样率
    audiosamplesize: f64,    // 音频位深
    stereo: bool,            // 是否立体声
    audiocodecid: f64,       // 音频编码 ID
    hasKeyframes: bool,      // 是否有关键帧索引
    keyframes: Option<Keyframes>, // 关键帧索引
    lastkeyframetimestamp: Option<f64>, // 最后关键帧时间
    lastkeyframelocation: Option<f64>,  // 最后关键帧位置
}
```

### 3. 输出格式

输出为 JSON 格式，便于管道处理：
```json
{
  "header": {
    "version": 1,
    "has_video": true,
    "has_audio": true,
    "data_offset": 9
  },
  "metadata": {
    "duration": 3600.5,
    "width": 1920,
    "height": 1080,
    "videodatarate": 6000,
    "framerate": 30,
    "videocodecid": 7,
    "audiodatarate": 128,
    "audiosamplerate": 44100,
    "audiosamplesize": 16,
    "stereo": true,
    "audiocodecid": 10,
    "has_keyframes": true,
    "keyframe_count": 120,
    "tag_count": 98765
  },
  "tags": {
    "video_tags": 50000,
    "audio_tags": 48000,
    "script_tags": 765
  }
}
```

## 开发注意事项

1. **大文件处理**：大型 FLV 文件（数 GB）解析时需注意内存使用，建议流式读取
2. **损坏容错**：部分 FLV 文件可能不完整，解析器应有一定的容错能力
3. **编码 ID 映射**：
   - 视频编码：2=Sorenson H.263, 3=Screen Video, 4=VP6, 7=AVC/H.264, 12=HEVC
   - 音频编码：0=Linear PCM, 1=ADPCM, 2=MP3, 10=AAC
4. **AMF 解析**：onMetaData 使用 AMF0/AMF3 编码，需实现相应的反序列化

## 使用场景

| 场景 | 用途 |
|------|------|
| 直播录制分析 | 检查录制的 FLV 文件完整性 |
| 视频质量检查 | 提取编码参数（分辨率/码率/帧率） |
| 文件修复验证 | 修复 FLV 后验证元数据是否正确 |
| 数据分析 | 批量提取大量 FLV 的编码信息 |

## 使用示例

### 命令行
```powershell
# 基本使用
biliup dump-flv recording.flv

# 配合 jq 提取特定字段
biliup dump-flv recording.flv | jq '.metadata.duration'

# 批量分析
foreach ($f in Get-ChildItem *.flv) {
    Write-Host "$($f.Name):"
    biliup dump-flv $f.FullName | jq '{duration, width, height, framerate}'
}
```

### Rust 调用
```rust
use biliup_cli::uploader::dump_flv;  // 假设模块导出

async fn analyze_flv(file_path: &str) {
    dump_flv(file_path.into()).await.unwrap();
}
```

## 相关阅读

- [07-download.md](./07-download.md) — 下载 FLV 直播流
