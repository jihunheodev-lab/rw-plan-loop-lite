# RW 3-Agent Lite

실사용 기준으로 최소 구성만 남긴 3-에이전트 오케스트레이션 템플릿입니다.

- `rw-planner`: 하이브리드 인터뷰(askQuestions) + 요구사항 정리 + 태스크 분해
- `rw-loop`: 구현 위임 + 검증 + 리뷰 게이트
- `rw-auto`: 상태 감지 + 다음 top-level 명령 라우팅(오케스트레이션)

핵심 의도:
- 사용은 쉽게 (`@rw-planner` -> `@rw-loop`)
- 동작은 견고하게 (Step 0 가드, 상태 토큰 계약, 검증 증거 강제)

## 한눈에 보는 구조

```text
workspace/
├─ .github/
│  ├─ agents/
│  │  ├─ rw-planner.agent.md
│  │  ├─ rw-loop.agent.md
│  │  └─ rw-auto.agent.md
│  └─ prompts/subagents/
│     ├─ rw-loop-coder.subagent.md
│     ├─ rw-loop-task-inspector.subagent.md
│     ├─ rw-loop-security-review.subagent.md
│     ├─ rw-loop-phase-inspector.subagent.md
│     └─ rw-loop-review.subagent.md
├─ .ai/                         # planner 첫 실행 시 자동 bootstrap 가능
│  ├─ CONTEXT.md               # Step 0 필수 참조
│  ├─ PLAN.md
│  ├─ PROGRESS.md
│  ├─ features/
│  ├─ tasks/
│  ├─ plans/
│  ├─ runtime/
│  └─ memory/shared-memory.md
└─ scripts/ (선택)
   ├─ orchestrator/rw-top-level-runner.mjs
   ├─ health/ai-health-check.mjs
   ├─ validation/check-prompts.mjs
   ├─ rw-smoke-test.sh
   ├─ rw-smoke-test.ps1
   └─ archive/archive-progress.mjs
```

## 동작 흐름 (시각화)

### 1) 전체 플로우

```mermaid
flowchart TD
    A[사용자 요청] --> B[@rw-auto 또는 @rw-planner]
    B --> C[Step 0: .ai/CONTEXT.md 확인]
    C --> C2[rw-auto: NEXT_COMMAND 라우팅]
    C2 --> D[@rw-planner: feature -> plan -> tasks]
    D --> E[NEXT_COMMAND=rw-loop]
    E --> F[@rw-loop: task lock -> coder 위임]
    F --> G[검증: completion delta + VERIFICATION_EVIDENCE]
    G --> H[Task Inspector + USER_PATH_GATE]
    H --> H2[Security Gate]
    H2 --> I{Phase 완료?}
    I -- 예 --> J[Phase Inspector]
    I -- 아니오 --> F
    J --> K{모든 Task 완료?}
    K -- 아니오 --> F
    K -- 예 --> L[Review Subagent]
    L --> M{REVIEW_STATUS}
    M -- OK --> N[NEXT_COMMAND=done]
    M -- FAIL/ESCALATE --> O[NEXT_COMMAND=rw-loop 또는 rw-planner]
```

### 2) 상태 전이(태스크 단위)

```text
pending -> in-progress -> completed
                |            ^
                v            |
              blocked --------

규칙:
- 단일 모드: rw-loop 1회 dispatch는 정확히 1개 task만 completed 가능
- 병렬 모드: dispatch한 N개 task가 같은 실행에서 정확히 N개 completed 되어야 함
- completed로 바뀌려면 VERIFICATION_EVIDENCE 증가가 필수
- 3-strike 실패 시 blocked + REVIEW-ESCALATE + rw-planner 재진입
```

## 에이전트별 책임 분리

| Agent | 하는 일 | 하지 않는 일 | 종료 토큰 |
|---|---|---|---|
| `rw-planner` | feature 수집, `PLAN_ID` 생성, `TASK-XX` 분해, `PROGRESS` 동기화 | 제품 코드 직접 구현 | `NEXT_COMMAND=rw-loop` |
| `rw-loop` | task 선택/락, coder 위임, 증거 검증, user-path/security/phase/review 게이트 | planner 역할(요구사항 재정의) | `NEXT_COMMAND=done/rw-loop/rw-planner` |
| `rw-auto` | 상태 감지, health-check, lock 관리, next command 라우팅 | planner/loop를 subagent로 내부 실행 | `AUTO_EXECUTION_MODE=ROUTE_ONLY`, `AUTO_ROUTE_TARGET=...`, `NEXT_COMMAND=...` |

## Step 0 가드 (견고성 핵심)

모든 에이전트는 시작 시 아래를 먼저 확인합니다.

1. `.ai/CONTEXT.md` 읽기
2. 필수 파일/디렉토리 존재 확인
3. 조건 미충족 시 표준 오류 토큰 출력 후 중단

주요 오류 토큰:
- `LANG_POLICY_MISSING`: auto-recovery 이후에도 CONTEXT 복구 실패
- `TARGET_ROOT_INVALID`: 필수 경로/권한 문제
- `RW_ENV_UNSUPPORTED`: `runSubagent` 사용 불가
- `RW_SUBAGENT_PROMPT_MISSING`: loop 하위 프롬프트 누락
- `PAUSE_DETECTED`: 긴급 정지 파일(`.ai/PAUSE.md`) 감지
- `SECURITY_GATE_FAILED`: 보안 게이트 실패

## 실제 사용 방법

### 기본 사용 (권장)

1. VS Code에서 워크스페이스 열기
2. `@rw-planner "원라인 기능 요청"`
3. `@rw-loop`
4. 완료될 때까지 `@rw-loop` 반복
5. `@rw-auto`는 자동 실행기가 아니라 다음 top-level 명령 제안 라우터로 사용

### Planner 질문 정책 (Hybrid)

`rw-planner`는 입력이 있어도 질문을 생략하지 않습니다.

1. 1차 Need-Gate(항상): 4개 핵심 질문
2. 필수 확인 항목:
   `TARGET_KIND` (`PRODUCT_CODE` / `AGENT_WORKFLOW`), `USER_PATH`,
   범위 경계(`in-scope` / `out-of-scope`), `ACCEPTANCE_SIGNAL`
3. 2차 Deep-Dive(조건부): 애매하거나 리스크가 크면 6~10개 추가 질문
4. 최종 확인(항상): 요약 확인 질문에 동의해야 태스크 생성

### Planner 서브에이전트 계획 단계

`rw-planner`는 계획 생성 시 `runSubagent`를 사용합니다.

1. `PLAN_STRATEGY=SINGLE`: Plan 서브에이전트 1회 실행
2. `PLAN_STRATEGY=PARALLEL_AUTO`: Plan 서브에이전트 4회 실행(후보안 생성)
3. 후보 계획 텍스트는 메인 채팅에 그대로 표시
4. `askQuestions`는 승인 질문에만 사용 (계획 본문 삽입 금지)
5. 승인 전에는 task/progress를 기록하지 않음

### 모호도 점수화와 자동 전략 선택

`rw-planner`는 별도 명령어 없이 모호도를 점수화하고 계획 전략을 자동 선택합니다.

점수 규칙(최대 100):
- `TARGET_KIND` 불명확: +25
- `USER_PATH` 불명확: +25
- `SCOPE_BOUNDARY` 불명확: +20
- `ACCEPTANCE_SIGNAL` 불명확: +20
- 대상 경로/파일 미지정: +10
- 범용 표현 위주 요청: +10
- 광범위 표현 사용: +5
- 3개 이상 디렉토리 영향 예상: +10
- 보안/데이터/권한 이슈 미해결: +15

전략 규칙:
1. 필수 필드가 하나라도 불명확하면 `PLAN_STRATEGY=PARALLEL_AUTO`
2. 아니면 `AMBIGUITY_SCORE >= 40`일 때 `PLAN_STRATEGY=PARALLEL_AUTO`
3. 나머지는 `PLAN_STRATEGY=SINGLE`

출력 토큰:
- `AMBIGUITY_SCORE=<0-100>`
- `AMBIGUITY_REASONS=<comma-separated-codes>`
- `PLAN_STRATEGY=<SINGLE|PARALLEL_AUTO>`

`PARALLEL_AUTO`일 때 동작:
- 후보안 4개를 `.ai/plans/<PLAN_ID>/candidate-plan-{1..4}.md`로 생성
- 비교표 `.ai/plans/<PLAN_ID>/candidate-selection.md` 작성
- 각 후보는 고정 섹션 + `## Candidate JSON` 블록을 포함
- 최종 task/progress 쓰기는 선택된 1개 안만 반영

### Planner 산출물 강화 (DAG + 연구 근거)

`rw-planner`는 task 분해 시 아래 파일을 추가로 생성/갱신합니다.

- `.ai/plans/<PLAN_ID>/task-graph.yaml`
  - `nodes`, `edges`, `parallel_groups` 포함
  - `rw-loop --parallel`에서 독립 태스크 선별 기준으로 사용
- `.ai/plans/<PLAN_ID>/research_findings_<focus_area>.yaml`
  - `focus_area`, `summary`, `citations(file:line)`, `assumptions` 포함
  - 근거 없는 단정 최소화 목적

### Feature 승인 게이트 (필수)

`rw-planner`는 feature 문서 승인이 없으면 태스크를 만들지 않습니다.

필수 메타데이터(Feature 파일):
- `Approval: PENDING|APPROVED`
- `Approved By: <name-or-id>`
- `Approved At: <YYYY-MM-DD>`
- `Feature Hash: <sha256>`

동작:
1. 인터뷰 후 feature 초안을 만들거나 갱신
2. `Approval != APPROVED`이면 아래 토큰을 출력하고 중단
   - `FEATURE_REVIEW_REQUIRED`
   - `FEATURE_REVIEW_REASON=<APPROVAL_MISSING|APPROVAL_RESET_SCOPE_CHANGED>`
   - `FEATURE_FILE=<path>`
   - `FEATURE_REVIEW_HINT=<what_to_edit>`
3. 사용자가 feature 내용을 리뷰/수정 후 `Approval: APPROVED`로 확정
4. 그 다음 실행에서만 planner가 task 생성
5. 승인 후 scope가 바뀌면 승인 상태를 `PENDING`으로 되돌리고 다시 리뷰 요구

템플릿 참고:
- `docs/feature-template.md`

### Feature 파일 네이밍

planner는 feature 파일명을 아래 순서로 선택합니다.

1. 이슈 키가 있으면: `JIRA-123-<slug>.md`
2. 없으면: `FEATURE-XX-<slug>.md`

예시:
- `.ai/features/JIRA-123-add-search-command.md`
- `.ai/features/FEATURE-04-add-search-command.md`

### 자동 오케스트레이션 사용 (Route-Only)

1. `@rw-auto "기능 요약"` 실행
2. `rw-auto`가 `scripts/health/ai-health-check.mjs`로 상태 점검/복구 시도
3. `rw-auto`가 `.ai/runtime/rw-auto.lock`으로 동시 실행 충돌 방지
4. `rw-auto`는 내부에서 planner/loop를 실행하지 않고 아래 토큰만 반환
   - `AUTO_EXECUTION_MODE=ROUTE_ONLY`
   - `AUTO_ROUTE_TARGET=<rw-planner|rw-loop|done>`
   - `NEXT_COMMAND=<...>`
5. 호출자(사용자/러너)가 `NEXT_COMMAND`를 읽고 top-level로 `@rw-planner` 또는 `@rw-loop` 실행
6. `NEXT_COMMAND=done`이면 종료

### Top-Level Runner (선택)

`rw-auto`를 route-only로 유지하면서도 자동 순환을 원하면 외부 러너를 사용합니다.

- 스크립트: `scripts/orchestrator/rw-top-level-runner.mjs`
- 역할: child 출력에서 `NEXT_COMMAND`(또는 `AUTO_ROUTE_TARGET`)를 파싱해 다음 top-level 명령 실행
- 주의: 실제 에이전트 실행 명령은 환경마다 달라서 템플릿으로 주입

예시(더미 명령으로 러너 동작 확인):

```powershell
node scripts/orchestrator/rw-top-level-runner.mjs `
  --auto-cmd "node -e \"console.log('NEXT_COMMAND=rw-planner')\"" `
  --planner-cmd "node -e \"console.log('NEXT_COMMAND=rw-loop')\"" `
  --loop-cmd "node -e \"console.log('NEXT_COMMAND=done')\""
```

템플릿 변수:
- `{summary}`: 원본 기능 요약
- `{summary_json}`: JSON escaped 요약 문자열
- `{loop_flags}`: loop 옵션 문자열
- `{step}`: 현재 스텝 번호
- `{agent}`: 현재 대상 에이전트

### 모드 옵션

- `@rw-loop --auto` 또는 `@rw-loop --no-hitl`: 중간 확인 질문 최소화
- `@rw-loop --hitl`: 사람 확인 유지
- `@rw-loop --parallel`: 독립 태스크 병렬 시도
- `@rw-loop --parallel --max-parallel=4`: 최대 4개까지 병렬 디스패치

### Coder TDD 규칙 (강제)

`rw-loop-coder`는 아래 순서를 강제합니다.

1. 테스트 먼저 작성/수정
2. 실패 테스트 확인
3. 최소 구현
4. 재테스트 통과 확인
5. 사용자 진입점(UI/CLI/API) 실제 연결 여부 확인

증거는 `VERIFICATION_EVIDENCE`로 남기며, 실패 테스트/성공 테스트/진입점 확인 항목이 모두 필요합니다.

## 첫 실행 시 생성되는 산출물

`rw-planner`가 없으면 bootstrap합니다.

- `.ai/CONTEXT.md`
- `.ai/PLAN.md`
- `.ai/PROGRESS.md`
- `.ai/memory/shared-memory.md`
- `.ai/plans/*/task-graph.yaml`
- `.ai/features/*`, `.ai/tasks/*`, `.ai/plans/*`

## 어떤 파일이 "필수"인가?

필수(실행 엔진):
- `.github/agents/rw-planner.agent.md`
- `.github/agents/rw-loop.agent.md`
- `.github/agents/rw-auto.agent.md`
- `.github/prompts/subagents/rw-loop-*.subagent.md`
- `.github/prompts/subagents/rw-loop-security-review.subagent.md`

선택(운영 편의):
- `scripts/validation/check-prompts.mjs`
- `scripts/orchestrator/rw-top-level-runner.mjs`
- `scripts/health/ai-health-check.mjs`
- `scripts/rw-smoke-test.sh`
- `scripts/rw-smoke-test.ps1`
- `scripts/archive/archive-progress.mjs`
- `docs/memory-contract.md`
- `docs/feature-template.md`

즉, 에이전트 파일만으로도 "동작"은 가능하지만,
검증/회귀 테스트/운영 자동화를 위해 scripts를 함께 두는 구성이 실무에서 더 안전합니다.

## 빠른 검증 명령

```bash
node scripts/health/ai-health-check.mjs --mode check
node scripts/validation/check-prompts.mjs
bash scripts/rw-smoke-test.sh
```

Windows PowerShell:

```powershell
node scripts/health/ai-health-check.mjs --mode check
node scripts/validation/check-prompts.mjs
powershell -ExecutionPolicy Bypass -File scripts/rw-smoke-test.ps1
```

## 메모리 계약

- 계약 문서: `docs/memory-contract.md`
- 런타임 파일: `.ai/memory/shared-memory.md`
- planner/loop는 짧은 의사결정 기록만 남깁니다.
- 비밀/개인정보 저장 금지.
