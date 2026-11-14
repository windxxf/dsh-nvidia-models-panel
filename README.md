# dsh-nvidia-models-panel

[DeepSeek Harness](https://github.com/deepseek-ai) 插件：在侧边栏提供「Nvidia 模型」面板。

- **检测**：拉取 NVIDIA NIM 当前可用的全部模型（`/v1/models`）
- **验证**：逐个模型真实发起对话试调用（流式首字节探测，对思考类模型也准确），标出「可用 / 不可用」
- **保存 Key**：在面板内直接保存 NVIDIA API Key（存入本机 profile 凭据，不写入任何配置文件或代码）
- **一键配置**：把试调用通过的模型写入 设置 → 模型 → nvidia 供应商目录，立即出现在对话框模型选择器中

## 安装

在 DeepSeek Harness 会话里对助手说（任选其一）：

**方式 A · GitHub 直装（最简单）**

> 用 plugin_manager 的 install_bundle 安装 github:windxxf/dsh-nvidia-models-panel

**方式 B · Release 包安装**

> 用 plugin_manager 的 install_bundle 安装 https://github.com/windxxf/dsh-nvidia-models-panel/releases/latest/download/dsh-nvidia-models-panel-1.0.0.tgz

**方式 C · 克隆安装**

```powershell
git clone https://github.com/windxxf/dsh-nvidia-models-panel.git
```

> 用 plugin_manager 的 install_bundle 安装目录 <克隆到的绝对路径>

安装完成后刷新页面即可。

## 使用

1. 打开侧边栏「Nvidia 模型」面板
2. 粘贴 [NVIDIA API Key](https://build.nvidia.com/) 并保存（只需一次，保存在本机）
3. 点击「检测」获取可用模型列表 → 「验证」逐个试调用
4. 点击「一键配置」，试调用通过的模型即写入 nvidia 供应商目录，可在对话模型选择器中直接选用

## 说明

- 零 npm 依赖：全部能力由 Harness 宿主提供，无需构建步骤
- API Key 保存在各电脑自己的 profile 凭据里，不随仓库/安装包迁移，换机需重新输入
- 「一键配置」写入当前 profile 的 `cordis.patch.yml`（llm-pi-ai 条目的 `providers.nvidia.models`），可重复点击，每次以最新验证结果为准
- 需要 DeepSeek Harness ≥ 0.2.1

## License

[MIT](LICENSE)
