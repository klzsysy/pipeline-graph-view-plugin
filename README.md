# Pipeline Graph View Plugin

[![Build Status](https://ci.jenkins.io/buildStatus/icon?job=Plugins%2Fpipeline-graph-view-plugin%2Fmain)](https://ci.jenkins.io/job/Plugins/job/pipeline-graph-view-plugin/job/main/)
[![Gitter](https://badges.gitter.im/jenkinsci/ux-sig.svg)](https://gitter.im/jenkinsci/ux-sig?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![Jenkins Plugin](https://img.shields.io/jenkins/plugin/v/pipeline-graph-view.svg)](https://plugins.jenkins.io/pipeline-graph-view)
[![Jenkins Plugin Installs](https://img.shields.io/jenkins/plugin/i/pipeline-graph-view.svg?color=blue)](https://plugins.jenkins.io/pipeline-graph-view)

![preview.png](docs/images/preview.png)

---

## Fork 定制内容（klzsysy fork）

> 这是一个 fork，在上游基础上加了三处我们自己的 Jenkins 需要的改动。上游仓库：
> <https://github.com/jenkinsci/pipeline-graph-view-plugin>。三处改动都集中在 3 个源文件 + 1 个测试文件，
> 升级上游时按同样思路重放即可（见文末"与上游同步"）。

### 1. 打开步骤即加载全量日志（不再出现 "There's more to see"）

- 文件：`src/main/frontend/pipeline-console-view/pipeline-console/main/PipelineConsoleModel.tsx`
- 改动：`TAIL_CONSOLE_LOG = -LOG_FETCH_SIZE` → `TAIL_CONSOLE_LOG = 0`
- 原因：上游默认只取日志尾部 150KiB，要看更早的内容必须点 "There's more to see - xxx KiB of logs hidden"；
  CI 单个步骤动辄几千行，排查问题时经常需要从头看。
- 原理：`TAIL_CONSOLE_LOG` 既是"初始 startByte"，也是"正在 tail"的哨兵值。置 0 后首次拉取
  `startByte=0`，服务端 `consoleOutput?nodeId=&startByte=` 会一直返回到日志末尾（服务端没有分块上限，
  `PipelineConsoleViewAction.LOG_THRESHOLD` 只是请求未带 `startByte` 时的兜底默认值），
  `stepBuffer.startByte > 0` 不再成立，按钮因此不会渲染；后续增量轮询/tail 逻辑不变。

### 2. 控制台字号对齐 Blue Ocean，并去掉 ANSI 粗体

- 文件：`src/main/webapp/js/style.css`（静态样式表，`PipelineConsoleViewAction/index.jelly` 直接引用，
  改它不需要动 SCSS/前端构建）
- 改动：见该文件末尾的"本 fork 定制"注释块
  - 正文 `font-size: 12px; line-height: 16px`、`padding-block: 0`
  - `.console-text .ansi-bold { font-weight: normal !important; }`
- 原因：
  - 上游正文继承 Jenkins core 的 `pre { line-height: 1.66 }`（≈27px/行），行距很空；
    Blue Ocean 是 `1.2rem`（JDL 的 `theme.less` 把 `html` 设为 `62.5%`，即 12px）+ `.log-body p { min-height: 16px }`，
    这里按同样的 12px / 16px 对齐。
  - 我们 CI 的彩色行行首是 `\x1b[1;3Xm`（bold + 颜色），本插件会把 SGR `1` 渲染成 `.ansi-bold`，
    界面里显得笨重；这里只保留颜色。输出端不改，所以终端 `less -R` / `docker logs` 仍是高亮色。

### 3. ANSI 解析器支持 256 色与 truecolor

- 文件：`src/main/frontend/pipeline-console-view/pipeline-console/main/Ansi.tsx`（新增单测 `Ansi.spec.tsx`）
- 改动：
  - 支持 `38;5;N` / `48;5;N`（xterm 256 色：6×6×6 色彩立方 + 24 级灰阶），换算为 `rgb()` 内联样式
  - 支持 `38;2;R;G;B` / `48;2;R;G;B`（truecolor）
  - `0-15` 仍走主题类 `ansi-fg-N` / `ansi-bg-N`，跟随 Jenkins 深浅主题，不写死 RGB
  - 解析改为按下标消费参数：`38;5;31` 不再被误读成"红色"；畸形码（如裸 `38;5`）只忽略自身，
    不再吃掉同一转义序列里后续的属性（`1;38;5;208` 的粗体仍生效）
- 原因：上游只处理 `30-37 / 40-47 / 90-97 / 100-107`。CI 里 docker/buildkit、`go test` 等第三方输出
  大量使用 256 色，之前会渲染成错误颜色甚至整行变底色块；我们自己的 e2e 日志也用 256 色区分并发用例。

### 构建与安装

```bash
mvn -DskipTests package     # 需要 JDK 17+ 与 Maven；产物：target/pipeline-graph-view.hpi
```

Jenkins → Manage Jenkins → Plugins → Advanced settings → **Deploy Plugin** 上传该 HPI，
然后**硬刷新浏览器**（Cmd/Ctrl+Shift+R），否则旧的前端 bundle 还在缓存里。

### 本机构建（macOS，系统里没有 JDK 17+ / Maven 时）

Jenkins 插件需要 **JDK 17+** 与 **Maven**（本机系统自带的 `java` 可能是 1.8）。
macOS 上最省事的办法是借用 IDE 自带的 JBR，再把 Maven 解到任意目录，不动系统环境：

```bash
# 1) JDK 17+：优先用独立安装的 OpenJDK（本机已装 21）
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
java -version && javac -version

# 备用：机器上没有独立 JDK 时，JetBrains 全家桶自带的 JBR 也是完整 JDK（含 javac）
# export JAVA_HOME="/Applications/GoLand.app/Contents/jbr/Contents/Home"

# 2) Maven：下载解压到本地目录（示例路径）
curl -sSL -o /tmp/maven.tar.gz \
  https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz
mkdir -p ~/tools/maven && tar xzf /tmp/maven.tar.gz -C ~/tools/maven --strip-components=1
MVN=~/tools/maven/bin/mvn

# 3) npm 缓存：放到可写目录（npm 默认的 ~/.npm 在某些沙箱/CI 里不可写）
export npm_config_cache=/tmp/npm-cache

# 4) 构建
#    版本号用「日期.v<sha>」：既单调递增，又远大于上游的构建号（当前上游 ~1013），
#    这样 Jenkins 不会把官方新版当成"有更新"来提示、更不会被误升级覆盖掉 fork。
#    （不传 -Dchangelist 时，本地非 CI、无 release tag 的环境会退化成
#      "999999-SNAPSHOT (private-…)"，不适合长期使用。）
cd <repo>
VER="$(date +%Y%m%d).v$(git rev-parse --short HEAD)"
$MVN -B -DskipTests -Dexec.skip=true -s /path/to/settings.xml -Dchangelist="$VER" package
ls -l target/pipeline-graph-view.hpi
```

产物版本示例：`Plugin-Version: 20260923.v32ea6d4`、`Jenkins-Version: 2.555.3`。
`-Dexec.skip=true` 用于跳过 Playwright Chromium 下载（`-DskipTests` 下测试本就不跑）。

#### 已验证的构建组合（2026-09-23）

- JDK：OpenJDK **21.0.12.1**（Homebrew，`/usr/libexec/java_home -v 21`）
- Maven：3.9.9；Node/npm：由 frontend-maven-plugin 2.0.2 自行下载（24.2.0 / 11.3.0）
- `-DskipTests -Dexec.skip=true`（跳过 Playwright Chromium 下载；`-DskipTests` 下测试本就不跑）
- 结果：`BUILD SUCCESS`，产物 `target/pipeline-graph-view.hpi`
  （`Plugin-Version: 662.ve2c93b4`、`Jenkins-Version: 2.555.3`），
  且构建内的 `npm mvntest`（prettier + tsc + eslint + vitest）通过

#### 网络：按仓库分流（重要）

`repo.jenkins-ci.org` 的产物会 302 到 S3，直连往往只有十几 KB/s，走代理可以快两个数量级；
而 Maven Central / nodejs.org / registry.npmjs.org 通常是直连更快（甚至代理不通）。
可以放一个 `settings.xml`，用 `nonProxyHosts` 把"快的仓库"排除在代理之外：

```xml
<settings>
  <proxies>
    <proxy>
      <id>local-http</id><active>true</active><protocol>http</protocol>
      <host>127.0.0.1</host><port>1080</port>
      <nonProxyHosts>repo.maven.apache.org|repo1.maven.org|nodejs.org|registry.npmjs.org|localhost|127.0.0.1</nonProxyHosts>
    </proxy>
    <proxy>
      <id>local-https</id><active>true</active><protocol>https</protocol>
      <host>127.0.0.1</host><port>1080</port>
      <nonProxyHosts>repo.maven.apache.org|repo1.maven.org|nodejs.org|registry.npmjs.org|localhost|127.0.0.1</nonProxyHosts>
    </proxy>
  </proxies>
</settings>
```

```bash
$MVN -B -s /path/to/settings.xml -DskipTests -Dchangelist=... package
```

两个已知坑（网络差时才会遇到）：

- `org.jenkins-ci.main:jenkins-war`（约 90MB，test scope）走代理可能中途断握手：
  用 `curl -x http://127.0.0.1:1080 -C -` 断点续传下好，放进本地仓库对应目录，并把
  `jenkins-war-<ver>.war>repo.jenkins-ci.org=` 补进同目录的 `_remote.repositories`。
- frontend-maven-plugin 会从 `repo.jenkins-ci.org/nodejs-dist|npm-dist` 拉 Node/npm，
  该路径有时会卡在 0 字节：直接从官方源预置到本地仓库缓存目录即可
  （`.../com/github/eirslett/node/<ver>/node-v<ver>-<platform>.tar.gz`、
  `.../com/github/eirslett/npm/<ver>/npm-<ver>.tar.gz`）。

### 与上游同步

```bash
git remote add upstream https://github.com/jenkinsci/pipeline-graph-view-plugin.git
git fetch upstream
git rebase upstream/main    # 三处改动很小，冲突时按上面各条重放即可
```

---

## Introduction

This plugin adds a visual representation of Jenkins pipelines, showing each stage of a run in a clear and easy-to-follow graph format. It’s designed to make pipeline progress and structure easier to understand at a glance.

## Features

- Visualize pipelines as an interactive, nested graph
- Navigate pipeline stages in a clear, collapsible list view
- View logs in real time without leaving the interface
- Toggle between graph and stage views; move and resize panes to suit your workflow
- [Collapse and expand individual stages](./docs/per-stage-collapse.md) with parallel branches or nested children
- Quickly access details of each step and its results
- Hide specific steps from view using the `hideFromView` Pipeline DSL step
- Designed for better readability and faster troubleshooting

## Getting started

1. Install the [Pipeline Graph View](https://plugins.jenkins.io/pipeline-graph-view/) plugin
2. Go to some pipeline build page (not the job page)
3. Click _Pipeline Overview_

Hidden steps are not displayed by default in the Pipeline Overview, but can be toggled visible using the filter controls.

## Screenshots

Basic pipeline:

![Different statuses](./docs/images/different-statuses.png)

Semi-complex pipeline:

![Semi complex pipeline](./docs/images/semi-complex-pipeline.png)

## Video

See a live demonstration from a Jenkins Contributor Summit:

[![Demo of Pipeline Graph View plugin](https://img.youtube.com/vi/MBI3MBY2eJ8/0.jpg)](https://www.youtube.com/watch?v=MBI3MBY2eJ8&t=3295 "Pipeline Graph View plugin")

## Pipeline DSL Extensions

### Hiding Steps from View

You can mark specific pipeline steps as hidden from the view by wrapping them with the `hideFromView` step:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo "This step is visible"

                hideFromView {
                    echo "This step is hidden by default"
                }

                echo "This step is also visible"
            }
        }
    }
}
```

## REST API

The REST API documentation can be found [here](https://editor-next.swagger.io/?url=https://raw.githubusercontent.com/jenkinsci/pipeline-graph-view-plugin/refs/heads/main/openapi.yaml).

## Contributing

Refer to our [contribution guidelines](./CONTRIBUTING.md).

## LICENSE

Licensed under MIT, see [LICENSE](LICENSE.md).
