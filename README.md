# DNS Manager（AI编写）

一个基于利用VPS吧API开发的DNS记录管理面板，方便将不能托管到cf的免费域名，托管到vps8进行集中管理。
可Cloudflare Pages / EdgeOne Pages 部署
## 功能特性

- **域名管理**：查看和管理所有域名列表
- **解析记录**：支持 A、AAAA、CNAME、MX、TXT、NS 等常见记录类型的增删改查
- **API 配置**：支持前端配置 API Key，或读取服务端环境变量
- **访问密码**：可选配置访问密码保护面板
- **主题切换**：支持深色/浅色模式，自动记忆偏好
- **响应式设计**：适配桌面端和移动端

## 部署方式

### 1. 部署到 Cloudflare Pages（没有尝试）

1. Fork 本仓库
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
3. 进入 **Pages** → **创建项目** → **连接到 Git**
4. 选择 Fork 的仓库，框架预设选择 **无**
5. 构建命令留空，输出目录填写 `/`
6. 添加环境变量（可选）：
   - `DNS_API_KEY`：DNS 服务商 API Key
   - `ACCESS_PASSWORD`：访问面板密码
7. 点击部署

### 2. 部署到 EdgeOne Pages

1. Fork 本仓库
2. 登录 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
3. 进入 **边缘安全加速** → **Pages**
4. 创建项目，选择 Git 仓库
5. 构建配置：
   - 构建命令：留空
   - 输出目录：`/`
6. 在 **环境变量** 中添加：
   - `DNS_API_KEY`：DNS 服务商 API Key
   - `ACCESS_PASSWORD`：访问面板密码
7. 部署

## 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DNS_API_KEY` | 否 | DNS 服务商 API Key。若不配置，用户需在页面手动输入 |
| `ACCESS_PASSWORD` | 否 | 访问密码。配置后，打开页面需先验证密码 |

## 项目结构

```
dns-manager/
├── edge-functions/
│   ├── index.js                    # 处理 / 和 /index.html，返回密码页面或管理页面
│   └── api/
│       ├── auth/
│       │   └── verify.js           # POST /api/auth/verify - 密码验证
│       └── client/
│           └── dnsopenapi/
│               └── [[default]].js   # API代理 /api/client/dnsopenapi/*
├── public/
│   └── index.html                    # 备用静态文件（edgeone.json 指向）
├── edgeone.json                       # 配置 + rewrite 规则
└── README.md                          # 可选
```

## API 接口说明

本项目通过 Edge Function 代理请求 DNS 服务商 OpenAPI，自动处理 CORS 和认证。

支持的接口：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/client/dnsopenapi/domain_list` | POST | 获取域名列表 |
| `/api/client/dnsopenapi/record_list` | POST | 获取解析记录列表 |
| `/api/client/dnsopenapi/record_create` | POST | 创建解析记录 |
| `/api/client/dnsopenapi/record_update` | POST | 更新解析记录 |
| `/api/client/dnsopenapi/record_delete` | POST | 删除解析记录 |

请求头：
```
Authorization: Basic client:<API_KEY>
Content-Type: application/json
```

## 常见问题

### API Key 配置方式

- **方式一（推荐）**：在 Pages 环境变量中配置 `DNS_API_KEY`，前端无需输入
- **方式二**：前端页面手动输入 API Key，保存在浏览器 localStorage 中
- 若同时配置两种方式，前端输入的 API Key 会覆盖环境变量

## 技术栈

- 前端：原生 HTML + Tailwind CSS + Font Awesome
- 后端：EdgeOne Pages Functions（Cloudflare Workers 兼容）
- 无构建步骤，单 HTML 文件即可运行

## License

MIT
