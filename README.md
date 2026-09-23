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
