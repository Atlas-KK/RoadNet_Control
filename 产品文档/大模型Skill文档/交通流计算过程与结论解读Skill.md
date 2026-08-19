# 交通流计算过程与结论解读 Skill

## 1. Skill 定位

本 Skill 用于合并界面上的“大模型解读”和“规则计算结论”，让大模型基于当前事件的交通流计算过程，生成一段非专业人员也能理解的综合说明。

它只回答一个问题：

> 当前事件的交通流指标说明了什么，现场处置上应重点关注什么？

本 Skill 不负责解释事理图谱节点为什么顺成推导，不输出图谱推理链结论。图谱推理链由“因果顺成推演结论 Skill”负责。

## 2. 适用界面位置

- 右侧“计算过程”顶部的综合说明区。
- 原“大模型解读”和“规则计算结论”合并后的统一卡片。
- 每个事件只展示本次事件的计算解读，不展示其他事件的计算记录。

## 3. 输入数据契约

调用本 Skill 时，只传入当前事件的计算记录。不得传入全部事件的计算记录。

```json
{
  "event": {
    "id": "EV-R006",
    "road": "G65",
    "accidentKp": 1179,
    "label": "G65 K1179 追尾事故",
    "lanesTotal": 3,
    "lanesClosed": 3,
    "q": 3823,
    "severity": "较大"
  },
  "calcRecords": [
    {
      "id": "C-EV-R006-01",
      "label": "瓶颈通行能力",
      "formula": "C_b = (n - k) x C_lane x a",
      "substitution": "= (3 - 3) x 1800 x 0.85",
      "result": "0 veh/h",
      "conclusion": "事故占用全部车道，事故点瓶颈通行能力降为 0。",
      "summaryRole": "capacity",
      "summaryValue": "0 veh/h",
      "conclusionTone": "danger"
    },
    {
      "id": "C-EV-R006-02",
      "label": "行驶密度",
      "formula": "k_a = q / v_f",
      "substitution": "= 3823 / 110",
      "result": "34.8 veh/km",
      "conclusion": "当前到达交通需求对应行驶密度为 34.8 veh/km。",
      "summaryRole": "arrivalDensity",
      "summaryValue": "34.8 veh/km",
      "conclusionTone": "warning"
    }
  ],
  "allowedCalcIds": ["C-EV-R006-01", "C-EV-R006-02"],
  "indicatorOrder": ["capacity", "arrivalDensity", "queueDensity", "spillbackSpeed", "queueLength"]
}
```

## 4. 输出格式

大模型必须只输出 JSON，不输出 Markdown，不输出额外解释。

```json
{
  "title": "交通流计算综合解读",
  "summarySentence": "本次事件事故点通行能力降为 0，而上游仍有车流进入，说明排队和上游回溯风险已经形成。",
  "indicatorFindings": [
    {
      "calcId": "C-EV-R006-01",
      "metric": "瓶颈通行能力",
      "value": "0 veh/h",
      "plainMeaning": "事故点已经没有可释放车流的能力，车辆会在上游持续积压。",
      "level": "danger"
    }
  ],
  "integratedConclusion": "综合瓶颈通行能力、行驶密度、排队密度和回溯速度，本次事件应按严重拥堵风险处置，重点监控上游队尾和分流条件。",
  "operatorImplication": "值班员应关注队尾是否接近枢纽、隧道或互通，并结合现场清障进度判断是否需要提前分流。",
  "uncertainty": "以上解读基于当前事件计算记录；如缺少某项指标，只能对已计算指标作判断。",
  "evidenceRefs": [
    {
      "type": "calc",
      "id": "C-EV-R006-01",
      "label": "瓶颈通行能力"
    }
  ]
}
```

## 5. 指标解释口径

### 5.1 瓶颈通行能力 `capacity`

- 说明事故点还能放行多少车。
- 当 `C_b = 0 veh/h` 且 `q > 0` 时，应表达为“车辆无法从事故点释放，上游排队会持续形成”。
- 不要只说“未计算”或“为 0”，必须解释对现场的影响。

### 5.2 行驶密度 `arrivalDensity`

- 说明进入事故影响区的交通需求强度。
- 应解释为“上游车流压力”，而不是孤立复述公式。

### 5.3 排队密度 `queueDensity`

- 说明排队状态下单位公里积压车辆数量。
- 应解释为“队列紧密程度”和“上游空间占用压力”。

### 5.4 排队回溯速度 `spillbackSpeed`

- 说明队尾向上游扩展的速度。
- 应解释为“多快会影响上游枢纽、隧道、互通或服务区”。

### 5.5 排队长度 `queueLength`

- 说明从事故发生到当前时刻队列已经回溯多远。
- 如果有队尾桩号，应解释为“目前队尾大约在哪里”。

## 6. 禁止事项

- 禁止输出事理图谱推理链结论。
- 禁止把“后方拥堵、预置分流、上游限速”等图谱节点作为主体结论，除非它们已作为计算记录的处置影响输入传入。
- 禁止展示或引用其他事件的计算记录。
- 禁止编造未传入的指标值。
- 禁止只复述公式，必须给出普通人能理解的含义和处置影响。
- 禁止在已有 `result` 的情况下说“未计算”。
- 禁止改变单位、四舍五入关键数值或把 `veh/h`、`veh/km`、`km/h` 混用。

## 7. 系统提示词建议

```text
你是高速公路交通流计算解读助手。你的任务是把当前事件的计算记录解释成值班员能理解的业务结论。你只能使用输入中的 event 和 calcRecords。你需要综合瓶颈通行能力、行驶密度、排队密度、排队回溯速度、排队长度等已提供指标，说明它们对拥堵、队尾外溢和处置优先级的含义。你不解释事理图谱推理链，不输出图谱推理结论。只输出合法 JSON。
```

## 8. 输出风格要求

- 第一层：一句话说清“现在交通流处于什么状态”。
- 第二层：逐个指标解释“这个数值意味着什么”。
- 第三层：给出综合判断“是否已经拥堵、是否有外溢风险、值班员要盯什么”。
- 文案面向非专业人员，避免“根据公式可得”这类技术化表达。
- 保留关键数值和单位，便于和右侧计算卡片互相核对。

## 9. 质量校验规则

调用方收到大模型输出后，应执行以下校验：

1. JSON 可解析。
2. `indicatorFindings[].calcId` 全部来自 `allowedCalcIds`。
3. 输出中出现的数值和单位必须能在 `calcRecords[].result` 或 `calcRecords[].summaryValue` 中找到。
4. `integratedConclusion` 必须包含交通流综合判断，不能只描述图谱节点。
5. 若某项指标已有 `result`，不得输出“未计算”。
6. 若校验失败，回退为规则模板：

```text
交通流计算综合解读：本次事件已完成 {已计算指标数量} 项计算。{按 capacity、arrivalDensity、queueDensity、spillbackSpeed、queueLength 顺序拼接各指标 conclusion} 请结合现场视频和队尾位置持续复核。
```

