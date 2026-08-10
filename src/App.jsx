import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  Check,
  CircleHalf,
  CircleNotch,
  Copy,
  DownloadSimple,
  Ear,
  FileAudio,
  FileText,
  GearSix,
  Microphone,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Timer,
  Trash,
  UploadSimple,
  UserCircle,
  ShieldCheck,
  Waveform,
  X,
} from "@phosphor-icons/react";
import { AdminPanel } from "./AdminPanel";
import { AuthScreen } from "./AuthScreen";
import { PrimaryButton3D, RailHardware3D, SpeedKnob3D, TransportHardware3D } from "./Hardware3D";
import { audioApi, credentialApi } from "./lib/api";
import { authClient } from "./lib/auth";
import { useMechanicalAudio } from "./useMechanicalAudio";

const modes = [
  { id: "tts", label: "语音合成", short: "合成", icon: Microphone },
  { id: "timed", label: "定时语音", short: "定时", icon: Timer },
  { id: "asr", label: "语音识别", short: "识别", icon: Ear },
  { id: "history", label: "历史记录", short: "历史", icon: Archive },
];

const TRANSPORT_STAGE_WIDTH = 1576;
const TRANSPORT_STAGE_HEIGHT = 178;

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function requestWithRetry(request, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || error.status === 408 || error.status === 429 || error.status >= 500;
      if (!retryable || attempt === attempts - 1) throw error;
      await wait(350 * (2 ** attempt));
    }
  }
  throw lastError;
}

const voices = [
  { id: "mimo_default", label: "MiMo Default · 默认音色" },
  { id: "冰糖", label: "冰糖 · 中文女声" },
  { id: "茉莉", label: "茉莉 · 中文女声" },
  { id: "苏打", label: "苏打 · 中文男声" },
  { id: "白桦", label: "白桦 · 中文男声" },
  { id: "Mia", label: "Mia · English Female" },
  { id: "Chloe", label: "Chloe · English Female" },
  { id: "Milo", label: "Milo · English Male" },
  { id: "Dean", label: "Dean · English Male" },
];

const speedModes = [
  { id: "very-slow", label: "极慢", instruction: "请使用极慢、从容的语速。", knob: 75 },
  { id: "slow", label: "慢", instruction: "请使用偏慢的语速。", knob: 88 },
  { id: "natural", label: "自然", instruction: "请使用自然语速。", knob: 100 },
  { id: "fast", label: "快", instruction: "请使用偏快但清晰的语速。", knob: 112 },
  { id: "very-fast", label: "极快", instruction: "请使用快速、紧凑且保持清晰的语速。", knob: 125 },
];

function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function SelectField({ label, value, onChange, children, hint }) {
  return (
    <Field label={label} hint={hint}>
      <span className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <CaretDown size={15} weight="bold" aria-hidden="true" />
      </span>
    </Field>
  );
}

function HardwareButton({ className = "", playSound, children, onClick, disabled, ...props }) {
  const [pressed, setPressed] = useState(false);
  const release = () => {
    if (!pressed) return;
    setPressed(false);
    playSound?.("transportUp", { volume: .2 });
  };
  return (
    <button
      className={`system-key ${className}`}
      data-pressed={pressed ? "true" : "false"}
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return;
        setPressed(true);
        playSound?.("transportDown", { volume: .24 });
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onClick}
      {...props}
    >{children}</button>
  );
}

function SystemPanel({ menuOpen, setMenuOpen, soundEnabled, setSoundEnabled, connected, onSettings, playSound }) {
  const connectionLabel = connected === null ? "确认中" : connected ? "已配置" : "未连接";
  return (
    <section className="system-panel" aria-label="系统控制">
      <div className="theme-module">
        <span className="system-caption">机身</span>
        <HardwareButton
          className="theme-key"
          playSound={playSound}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <CircleHalf size={16} weight="fill" />
          <span>Studio Hybrid</span>
          <CaretDown size={13} weight="bold" />
        </HardwareButton>
        {menuOpen && (
          <div className="theme-menu" role="menu" aria-label="机身主题">
            <button role="menuitemradio" aria-checked="true" onClick={() => setMenuOpen(false)}>
              <Check size={15} weight="bold" /><span><strong>Studio Hybrid</strong><small>默认机身</small></span>
            </button>
            <p>其余机身将在默认版验收后开放。</p>
          </div>
        )}
      </div>
      <HardwareButton
        className="sound-key"
        playSound={playSound}
        aria-label={soundEnabled ? "关闭机械音效" : "开启机械音效"}
        aria-pressed={soundEnabled}
        title={soundEnabled ? "机械音效已开启" : "机械音效已关闭"}
        onClick={() => setSoundEnabled(!soundEnabled)}
      >{soundEnabled ? <SpeakerHigh size={19} weight="fill" /> : <SpeakerSlash size={19} />}</HardwareButton>
      <div className="connection" data-connected={connected === true ? "true" : "false"} data-pending={connected === null ? "true" : "false"}>
        <i aria-hidden="true" /><span>{connectionLabel}</span>
      </div>
      <HardwareButton className="settings-key" playSound={playSound} aria-label="连接设置" title="连接设置" onClick={onSettings}>
        <GearSix size={21} />
      </HardwareButton>
    </section>
  );
}

function ChassisCap() {
  return (
    <div className="left-cap" aria-hidden="true">
      <span className="cap-insignia"><Waveform size={22} weight="bold" /><small>VOICE<br />INSTRUMENT</small></span>
    </div>
  );
}

function MainHeader({ mode }) {
  const current = modes.find((item) => item.id === mode);
  return (
    <header className="main-header">
      <div className="brand">
        <span className="brand-mark"><Waveform size={23} weight="bold" /></span>
        <div><strong>MiMo <em>Studio</em></strong><small>V2.5 VOICE INSTRUMENT</small></div>
      </div>
      <div className="mode-readout" aria-live="polite">
        <span>CURRENT MODE</span>
        <strong>{current?.label}</strong>
      </div>
    </header>
  );
}

function ModeRail({ active, onChange, playSound, compact }) {
  const [pressedIndex, setPressedIndex] = useState(-1);
  const [pendingMode, setPendingMode] = useState("");
  const timersRef = useRef([]);
  const visualActive = pendingMode || active;
  const activeIndex = modes.findIndex((mode) => mode.id === visualActive);

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);

  const releaseKey = () => setPressedIndex(-1);
  const activateMode = (mode) => {
    if (mode.id === visualActive) {
      playSound("switchUp", { volume: .16 });
      return;
    }
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    setPendingMode(mode.id);
    timersRef.current.push(window.setTimeout(() => playSound("switchUp", { volume: .19 }), 62));
    timersRef.current.push(window.setTimeout(() => {
      onChange(mode.id);
      setPendingMode("");
    }, 104));
  };

  return (
    <nav className="mode-rail" aria-label="工作模式">
      <span className="hardware-layer" aria-hidden="true"><RailHardware3D activeIndex={activeIndex} pressedIndex={pressedIndex} horizontal={compact} /></span>
      {modes.map((mode, index) => {
        const Icon = mode.icon;
        const state = pressedIndex === index ? "pressed" : visualActive === mode.id ? "active" : "rest";
        return (
          <button
            key={mode.id}
            className="mode-button"
            data-state={state}
            aria-current={active === mode.id ? "page" : undefined}
            onPointerDown={() => {
              setPressedIndex(index);
              playSound("switchDown", { volume: .27 });
            }}
            onPointerUp={releaseKey}
            onPointerLeave={releaseKey}
            onPointerCancel={releaseKey}
            onKeyDown={(event) => {
              if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                setPressedIndex(index);
                playSound("switchDown", { volume: .27 });
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") releaseKey();
            }}
            onClick={() => activateMode(mode)}
          >
            <span className="mode-button-face">
              <Icon size={29} weight={visualActive === mode.id ? "fill" : "regular"} aria-hidden="true" />
              <span className="mode-label">{mode.label}</span>
              <span className="mode-short">{mode.short}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function HardwarePrimaryButton({ label, children, disabled, playSound, ...props }) {
  const [pressed, setPressed] = useState(false);
  const release = () => {
    if (!pressed) return;
    setPressed(false);
    playSound?.("transportUp", { volume: .22 });
  };
  return (
    <button
      className="primary-button hardware-primary"
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return;
        setPressed(true);
        playSound?.("transportDown", { volume: .3 });
      }}
      onPointerUp={release}
      onPointerLeave={release}
      {...props}
    >
      <span className="hardware-layer" aria-hidden="true"><PrimaryButton3D pressed={pressed} disabled={disabled} /></span>
      <span className="hardware-primary-content">{children}<span className="hardware-primary-label">{label}</span></span>
    </button>
  );
}

function CounterModule({ count }) {
  return <div className="counter-module" aria-label={`${count} / 4096 个字符`}><span>CHAR</span><strong>{String(count).padStart(4, "0")}</strong><i>/ 4096</i></div>;
}

function EditorPanel({ mode, text, setText, onPrimary, onCancel, primaryDisabled, busy, streamPreviewing, currentAudio, asrFile, onAsrFileChange, asrResult, onAsrResultChange, asrSaveState, onCopyTranscript, onCopyMarkdown, onReupload, playSound }) {
  const textareaRef = useRef(null);
  const meta = {
    tts: { eyebrow: "TEXT TO SPEECH", title: "输入文本", note: "把文字变成可直接使用的自然语音。", action: "生成语音" },
    timed: { eyebrow: "TIMED DELIVERY", title: "定时语音", note: "在目标时长内，自动寻找最自然的表达速度。", action: "生成定时语音" },
    asr: { eyebrow: "SPEECH TO TEXT", title: "音频输入", note: "上传录音，得到结构清晰、可复制的文字。", action: "开始识别" },
  }[mode];

  const insertCue = (cue) => {
    const node = textareaRef.current;
    const start = node?.selectionStart ?? text.length;
    const end = node?.selectionEnd ?? start;
    const next = `${text.slice(0, start)}${cue}${text.slice(end)}`.slice(0, 4096);
    setText(next);
    playSound("switchDown", { volume: .14 });
    requestAnimationFrame(() => {
      node?.focus();
      node?.setSelectionRange(start + cue.length, start + cue.length);
    });
  };

  if (mode === "asr") {
    const resultReady = Boolean(asrResult);
    return (
      <section className="editor-panel upload-panel" aria-labelledby="workspace-title">
        <div className="workspace-heading">
          <div><span className="eyebrow">{meta.eyebrow}</span><h1 id="workspace-title">{resultReady ? "识别文本" : meta.title}</h1></div>
          <p>{resultReady ? "在同一工作区校对、复制或重新装载音频。" : meta.note}</p>
        </div>
        <div className="display-bezel upload-bezel">
          {resultReady ? (
            <div className="asr-editor-frame">
              <div className="asr-editor-toolbar">
                <span><i />TRANSCRIPT</span>
                <div>
                  <button onClick={onCopyTranscript} title="复制纯文本"><Copy size={15} />复制</button>
                  <button onClick={onCopyMarkdown} title="复制 Markdown"><FileText size={15} />复制 MD</button>
                  <button onClick={onReupload} title="重新上传音频" disabled={busy}><ArrowCounterClockwise size={15} />重新上传</button>
                </div>
              </div>
              <textarea value={asrResult} onChange={(event) => onAsrResultChange(event.target.value)} aria-label="可编辑的识别文本" spellCheck="true" readOnly={busy} />
              <div className="asr-editor-status" data-state={asrSaveState}>
                <span>{asrFile?.name}</span>
                <strong>{asrSaveState === "streaming" ? "LIVE TRANSCRIPT" : asrSaveState === "interrupted" ? "INTERRUPTED" : asrSaveState === "saving" ? "SAVING" : asrSaveState === "error" ? "SAVE ERROR" : "SAVED"}</strong>
              </div>
            </div>
          ) : (
            <label className={`drop-zone ${asrFile ? "has-file" : ""} ${busy ? "is-processing" : ""}`}>
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" onChange={(event) => onAsrFileChange(event.target.files?.[0] || null)} disabled={busy} />
              {busy ? <CircleNotch className="spin" size={54} /> : asrFile ? <FileAudio size={54} weight="duotone" /> : <UploadSimple size={54} weight="thin" />}
              <strong>{busy ? "MiMo 正在识别音频" : asrFile?.name || "将音频拖到这里，或选择文件"}</strong>
              <span>{busy ? "完成后，这里会直接变为可编辑文本" : asrFile ? "文件已装载，可以开始识别" : "MP3 / WAV · 最大 7 MB"}</span>
            </label>
          )}
        </div>
        <div className="editor-footer">
          <div className="counter-module file-status"><span>{resultReady ? "TEXT" : "INPUT"}</span><strong>{resultReady ? `${asrResult.length} CHAR` : asrFile ? "LOADED" : "EMPTY"}</strong><i>{resultReady ? "可编辑结果" : asrFile ? "音频就绪" : "等待文件"}</i></div>
          <div className="editor-actions">
            {busy ? (
              <button className="utility-key is-danger" onClick={onCancel}><Stop size={17} weight="fill" />停止识别</button>
            ) : resultReady ? (
              <button className="utility-key asr-reupload-key" onClick={onReupload}><ArrowCounterClockwise size={17} />重新上传</button>
            ) : <>
              <button className="utility-key" onClick={() => onAsrFileChange(null)} disabled={!asrFile || busy}><Trash size={17} />清除</button>
              <HardwarePrimaryButton label={busy ? "识别中" : meta.action} onClick={onPrimary} disabled={!asrFile || busy} playSound={playSound} aria-label={busy ? "识别中" : meta.action}>
                {busy ? <CircleNotch className="spin" size={20} /> : <Ear size={20} weight="fill" />}
              </HardwarePrimaryButton>
            </>}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-panel" aria-labelledby="workspace-title">
      <div className="workspace-heading">
        <div><span className="eyebrow">{meta.eyebrow}</span><h1 id="workspace-title">{meta.title}</h1></div>
        <p>{meta.note}</p>
      </div>
      <div className="display-bezel">
        <div className="editor-frame">
          <div className="editor-tools" aria-label="朗读控制">
            <span className="display-label">PROSODY</span>
            <button onClick={() => insertCue("[停顿]")}>停顿</button>
            <button onClick={() => insertCue("[强调]")}>强调</button>
            <button onClick={() => insertCue("[慢速]")}>慢速</button>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            maxLength={4096}
            onChange={(event) => setText(event.target.value)}
            placeholder="在此输入要合成语音的文本内容…"
            aria-label="要合成语音的文本"
          />
          <div className="display-status" aria-live="polite"><i data-active={currentAudio || streamPreviewing ? "true" : "false"} />{streamPreviewing ? "LIVE PCM16 PREVIEW" : busy ? "PROCESSING" : currentAudio ? "AUDIO READY" : "INPUT READY"}</div>
        </div>
      </div>
      <div className="editor-footer">
        <CounterModule count={text.length} />
        <div className="editor-actions">
          <button className={`utility-key ${busy ? "is-danger" : ""}`} onClick={busy ? onCancel : () => setText("")} disabled={!busy && !text}>{busy ? <Stop size={17} weight="fill" /> : <Trash size={17} />}{busy ? "停止" : "清空"}</button>
          <HardwarePrimaryButton label={busy ? streamPreviewing ? "实时播放中" : "生成中" : currentAudio ? "重新生成" : meta.action} onClick={onPrimary} disabled={!text.trim() || busy || primaryDisabled} playSound={playSound} aria-label={busy ? streamPreviewing ? "实时播放中" : "生成中" : currentAudio ? "重新生成" : meta.action}>
            {busy ? <CircleNotch className="spin" size={20} /> : <Waveform size={20} weight="bold" />}
          </HardwarePrimaryButton>
        </div>
      </div>
    </section>
  );
}

function HistoryPanel({ history, filter, onFilter, onLoad, onOpenTranscript, onDownload, currentAudio }) {
  const filtered = history.filter((item) => filter === "all" || item.kind.toLowerCase() === filter);
  return (
    <section className="editor-panel history-panel" aria-labelledby="workspace-title">
      <div className="workspace-heading">
        <div><span className="eyebrow">AUDIO LIBRARY</span><h1 id="workspace-title">历史记录</h1></div>
        <p>选择录音后会装载到底部播放器，播放状态不会因切换页面而丢失。</p>
      </div>
      <div className="history-toolbar" aria-label="历史筛选">
        {[['all', '全部'], ['tts', 'TTS'], ['asr', 'ASR']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => onFilter(id)}>{label}</button>)}
      </div>
      <div className="display-bezel history-bezel">
        <div className="history-list">
          {filtered.map((item) => (
            <article className="history-row" key={item.id} data-loaded={currentAudio?.id === item.id ? "true" : "false"}>
              <button className="round-control" aria-label={item.kind === "ASR" ? `打开识别文本 ${item.title}` : `播放 ${item.title}`} onClick={() => item.kind === "ASR" ? onOpenTranscript(item) : onLoad(item, true)}>{item.kind === "ASR" ? <FileText size={17} weight="fill" /> : <Play size={17} weight="fill" />}</button>
              <div className="history-copy"><strong>{item.title}</strong><span>{item.kind} · {item.voice} · {item.duration}</span></div>
              <time>{item.time}</time>
              <button className="history-download" aria-label={`下载 ${item.title}`} onClick={() => onDownload(item)}><DownloadSimple size={19} /></button>
            </article>
          ))}
          {!filtered.length && <div className="history-empty">这个筛选条件下还没有录音。</div>}
        </div>
      </div>
    </section>
  );
}

function InteractiveKnob({ value, onChange }) {
  const index = Math.max(0, speedModes.findIndex((item) => item.id === value));
  const current = speedModes[index];
  return (
    <div className="knob-control">
      <input
        className="knob-input"
        type="range"
        min="0"
        max="4"
        step="1"
        value={index}
        onChange={(event) => onChange(speedModes[Number(event.target.value)].id)}
        aria-label="语速"
        aria-valuetext={current.label}
      />
      <div className="speed-knob" aria-hidden="true"><SpeedKnob3D value={current.knob} /></div>
      <div className="knob-legend" aria-hidden="true"><span>极慢</span><strong>{current.label}</strong><span>极快</span></div>
    </div>
  );
}

function Inspector({ mode, generationMode, setGenerationMode, voice, setVoice, delivery, setDelivery, directorInstruction, setDirectorInstruction, voiceDescription, setVoiceDescription, optimizeTextPreview, setOptimizeTextPreview, cloneFile, setCloneFile, cloneConsent, setCloneConsent, format, setFormat, lowLatencyPreview, setLowLatencyPreview, speed, setSpeed, targetDuration, setTargetDuration, asrLanguage, setAsrLanguage, onPreviewVoice }) {
  return (
    <aside className="inspector" aria-label="当前模式设置">
      <div className="inspector-content">
        {mode === "tts" && <>
          <section className="inspector-section">
            <div className="section-heading"><i aria-hidden="true" /><span>生成方式</span><small>MODEL</small></div>
            <SelectField label="语音模型" value={generationMode} onChange={setGenerationMode}>
              <option value="preset">内置音色</option>
              <option value="design">音色设计</option>
              <option value="clone">音色克隆</option>
            </SelectField>
          </section>
          <section className="inspector-section">
            <div className="section-heading"><i aria-hidden="true" /><span>{generationMode === "design" ? "音色设计" : generationMode === "clone" ? "参考声音" : "音色"}</span><small>VOICE</small></div>
            {generationMode === "preset" && <>
              <SelectField label="当前音色" value={voice} onChange={setVoice}>{voices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField>
              <button className="preview-voice" onClick={onPreviewVoice}><Play size={15} weight="fill" />试听当前音色</button>
            </>}
            {generationMode === "design" && <>
              <Field label="用自然语言描述声音" hint="例如：沉稳、略带沙哑的中年男声">
                <textarea className="inspector-textarea" value={voiceDescription} maxLength={1000} onChange={(event) => setVoiceDescription(event.target.value)} placeholder="描述年龄、音色、气质与说话感觉…" />
              </Field>
              <label className="console-check"><input type="checkbox" checked={optimizeTextPreview} onChange={(event) => setOptimizeTextPreview(event.target.checked)} /><span><strong>优化试听文本</strong><small>仅音色设计模型支持</small></span></label>
            </>}
            {generationMode === "clone" && <>
              <label className="clone-file"><input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" onChange={(event) => setCloneFile(event.target.files?.[0] || null)} /><FileAudio size={18} /><span>{cloneFile?.name || "选择 MP3 / WAV 参考音频"}</span></label>
              <label className="console-check"><input type="checkbox" checked={cloneConsent} onChange={(event) => setCloneConsent(event.target.checked)} /><span><strong>我有权使用并克隆此声音</strong><small>参考音频仅用于本次请求，不保存</small></span></label>
            </>}
          </section>
          <section className="inspector-section expression-section">
            <div className="section-heading"><i aria-hidden="true" /><span>表达</span><small>DELIVERY</small></div>
            <SelectField label="表达方式" value={delivery} onChange={setDelivery}>
              <option>自然 · 标准语速</option><option>专业播报</option><option>温柔叙述</option><option>有声书</option>
            </SelectField>
            <Field label="五档物理语速"><InteractiveKnob value={speed} onChange={setSpeed} /></Field>
            <Field label="导演指令" hint="可描述情绪、节奏、场景或表演方式"><textarea className="inspector-textarea compact" value={directorInstruction} maxLength={1000} onChange={(event) => setDirectorInstruction(event.target.value)} placeholder="例如：像深夜电台主持人一样温暖克制…" /></Field>
          </section>
        </>}
        {mode === "timed" && <>
          <section className="inspector-section">
            <div className="section-heading"><i aria-hidden="true" /><span>目标时长</span><small>DURATION</small></div>
            <Field label="秒"><input className="number-input" type="number" min="5" max="300" value={targetDuration} onChange={(event) => setTargetDuration(event.target.value)} /></Field>
            <p className="inspector-note">系统优先保持自然度，再逐步逼近目标时长。</p>
          </section>
          <section className="inspector-section"><div className="section-heading"><i aria-hidden="true" /><span>音色</span><small>VOICE</small></div><SelectField label="当前音色" value={voice} onChange={setVoice}>{voices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField></section>
        </>}
        {mode === "asr" && <>
          <section className="inspector-section"><div className="section-heading"><i aria-hidden="true" /><span>识别语言</span><small>LANGUAGE</small></div><SelectField label="语种" value={asrLanguage} onChange={setAsrLanguage}><option value="auto">自动检测</option><option value="zh">中文</option><option value="en">English</option></SelectField></section>
          <section className="inspector-section asr-guide"><div className="section-heading"><i aria-hidden="true" /><span>结果工作台</span><small>OUTPUT</small></div><p>识别完成后，上传区会变为可编辑文本。修改会自动保存到你的账户。</p></section>
        </>}
        {(mode === "tts" || mode === "timed") && <section className="inspector-section output-section">
          <div className="section-heading"><i aria-hidden="true" /><span>输出</span><small>FORMAT</small></div>
          <SelectField label="文件格式" value={format} onChange={(value) => { setFormat(value); if (value.startsWith("MP3")) setLowLatencyPreview(false); }}><option>WAV · PCM16 · 24kHz</option><option>MP3 · 压缩音频</option><option>PCM16 · 24kHz</option></SelectField>
          {mode === "tts" && generationMode === "preset" && <label className="console-check stream-check"><input type="checkbox" checked={lowLatencyPreview} disabled={format.startsWith("MP3")} onChange={(event) => setLowLatencyPreview(event.target.checked)} /><span><strong>低延迟实时试听</strong><small>{format.startsWith("MP3") ? "MP3 需要完整生成后播放" : "PCM16 分片到达后立即播放，最终保存为 WAV"}</small></span></label>}
          {mode === "tts" && generationMode !== "preset" && <p className="stream-mode-note">音色设计与音色克隆使用官方兼容模式：完成生成后播放，不标记为低延迟。</p>}
          <details><summary><SlidersHorizontal size={17} />格式说明</summary><p>WAV 适合编辑，MP3 适合分享，PCM16 为 24kHz 原始流格式。</p></details>
        </section>}
        {mode === "history" && <section className="inspector-section library-note">
          <div className="section-heading"><i aria-hidden="true" /><span>资料库</span><small>LIBRARY</small></div>
          <p>从中间列表选择音频；已装载的项目会保持在下方播放器中。</p>
        </section>}
      </div>
    </aside>
  );
}

function MechanicalTransportButton({ control, pressedControl, setPressedControl, playSound, disabled, active = false, onClick, label, children, className = "" }) {
  const press = () => {
    if (disabled) return;
    setPressedControl(control);
    playSound("transportDown", { volume: .34 });
  };
  const release = () => {
    if (pressedControl !== control) return;
    setPressedControl("");
    playSound("transportUp", { volume: .27 });
  };
  return <button
    className={`mechanical-control ${className}`}
    data-control={control}
    data-pressed={pressedControl === control ? "true" : "false"}
    data-latched={active ? "true" : "false"}
    aria-label={label}
    disabled={disabled}
    onPointerDown={press}
    onPointerUp={release}
    onPointerLeave={release}
    onPointerCancel={release}
    onKeyDown={(event) => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) press();
    }}
    onKeyUp={(event) => {
      if (event.key === " " || event.key === "Enter") release();
    }}
    onClick={onClick}
  >
    <span className="mechanical-control-face">{children}</span>
  </button>;
}

function formatPlaybackTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const hundredths = Math.floor((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function Transport({ busy, previewing, currentAudio, playing, setPlaying, playbackTime, playbackDuration, onSeek, onStop, history, onLoad, onDownload, playSound }) {
  const transportRef = useRef(null);
  const [pressedControl, setPressedControl] = useState("");
  const duration = playbackDuration || currentAudio?.durationSeconds || 0;
  const statusKey = playing || previewing ? "play" : busy ? "process" : "ready";
  const spokenStatus = previewing ? "实时试听" : statusKey === "play" ? "正在播放" : statusKey === "process" ? "处理中" : currentAudio ? "已装载" : "待机";

  useEffect(() => {
    const node = transportRef.current;
    if (!node) return undefined;
    const updateScale = () => {
      const rect = node.getBoundingClientRect();
      const scale = Math.min(rect.width / TRANSPORT_STAGE_WIDTH, rect.height / TRANSPORT_STAGE_HEIGHT);
      node.style.setProperty("--transport-scale", String(Number.isFinite(scale) && scale > 0 ? scale : 1));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cycle = (direction) => {
    if (!history.length) return;
    const index = Math.max(0, history.findIndex((item) => item.id === currentAudio?.id));
    const next = history[(index + direction + history.length) % history.length];
    onLoad(next, true);
  };
  const disabled = !currentAudio;
  const currentSeconds = Math.min(Math.max(0, playbackTime || 0), duration || 0);
  const seekDisabled = disabled || !duration;
  const seekFromPointer = (event) => {
    if (seekDisabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <footer ref={transportRef} className="transport" aria-label="播放器">
      <span className="hardware-layer" aria-hidden="true"><TransportHardware3D playing={playing || previewing} statusKey={statusKey} pressedControl={pressedControl} /></span>
      <div className="transport-ui">
        <div className="cassette-window" aria-label="磁带播放舱" />
        <div className="transport-status" role="status" aria-live="polite" aria-label={`播放器状态：${spokenStatus}`}>
          <div className="task-readout">
            <div className="task-meta-line"><span>{previewing ? "LIVE STREAM" : "LOADED TAPE"}</span><small>｜ {previewing ? "PCM16 24KHZ" : currentAudio ? `${currentAudio.kind} ${currentAudio.voice}` : "NO SOURCE"}</small></div>
            <strong>{previewing ? "LOW LATENCY PREVIEW" : currentAudio?.title || "NO MEDIA"}</strong>
          </div>
          <div className="status-bank">
            <span className={`lamp-label ${statusKey === "ready" ? "active" : ""}`}><i /><strong>READY</strong></span>
            <span className={`lamp-label ${statusKey === "process" ? "active" : ""}`}><i /><strong>PROCESS</strong></span>
            <span className={`lamp-label ${statusKey === "play" ? "active" : ""}`}><i /><strong>PLAY</strong></span>
          </div>
        </div>
        <div className="transport-controls" aria-label="播放控制">
          <MechanicalTransportButton control="previous" pressedControl={pressedControl} setPressedControl={setPressedControl} playSound={playSound} disabled={!history.length} label="上一条" onClick={() => cycle(-1)}><SkipBack size={19} weight="fill" /></MechanicalTransportButton>
          <MechanicalTransportButton control="stop" pressedControl={pressedControl} setPressedControl={setPressedControl} playSound={playSound} disabled={disabled} label="停止" onClick={onStop}><Stop size={17} weight="fill" /></MechanicalTransportButton>
          <MechanicalTransportButton control="play" pressedControl={pressedControl} setPressedControl={setPressedControl} playSound={playSound} disabled={disabled} active={playing} className="play-control" label={playing ? "暂停" : "播放"} onClick={() => currentAudio && setPlaying(!playing)}>{playing ? <Pause size={23} weight="fill" /> : <Play size={23} weight="fill" />}</MechanicalTransportButton>
          <MechanicalTransportButton control="next" pressedControl={pressedControl} setPressedControl={setPressedControl} playSound={playSound} disabled={!history.length} label="下一条" onClick={() => cycle(1)}><SkipForward size={19} weight="fill" /></MechanicalTransportButton>
        </div>
        <div className="signal-bank">
          <div className="waveform-window" aria-hidden="true" />
          <div className="timeline-row">
            <span>{formatPlaybackTime(currentSeconds)}</span>
            <input
              aria-label="播放进度"
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={currentSeconds}
              onInput={(event) => onSeek(Number(event.currentTarget.value))}
              onChange={(event) => onSeek(Number(event.currentTarget.value))}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                seekFromPointer(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) seekFromPointer(event);
              }}
              disabled={seekDisabled}
            />
            <span>{formatPlaybackTime(duration)}</span>
          </div>
        </div>
        <MechanicalTransportButton control="download" pressedControl={pressedControl} setPressedControl={setPressedControl} playSound={playSound} disabled={disabled} className="download-control" label="下载" onClick={() => currentAudio && onDownload(currentAudio)}><DownloadSimple size={22} /><span>下载</span></MechanicalTransportButton>
      </div>
    </footer>
  );
}

function SettingsDialog({ open, onClose, user, credential, onCredentialChange, onCredentialRefresh, onOpenAdmin }) {
  const dialogRef = useRef(null);
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(credential?.baseUrl || "https://api.xiaomimimo.com/v1");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setKey("");
    setBaseUrl(credential?.baseUrl || "https://api.xiaomimimo.com/v1");
    setMessage("");
    setError("");
    const node = dialogRef.current;
    const previous = document.activeElement;
    node?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = [...node.querySelectorAll("button,input,select")].filter((el) => !el.disabled);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [open, onClose, credential?.baseUrl]);

  const save = async () => {
    if (!baseUrl.trim()) return setError("请输入 MiMo API Base URL");
    if (!credential?.configured && !key.trim()) return setError("首次保存需要输入 MiMo API Key");
    setBusy("save"); setError(""); setMessage("");
    try {
      const next = await credentialApi.save({ apiKey: key.trim(), baseUrl: baseUrl.trim() });
      onCredentialChange({ ...credential, ...next });
      setKey("");
      setMessage("密钥已加密保存，浏览器不会保留明文。");
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(""); }
  };

  const test = async () => {
    setBusy("test"); setError(""); setMessage("");
    try { const result = await credentialApi.test(); setMessage(result.message); }
    catch (testError) { setError(testError.message); }
    finally { setBusy(""); }
  };

  const refresh = async () => {
    setBusy("refresh"); setError(""); setMessage("");
    try {
      const next = await onCredentialRefresh();
      setMessage(next.configured ? "已重新读取账户中的连接配置。" : "账户中尚未保存 MiMo API Key。");
    } catch (refreshError) { setError(refreshError.message); }
    finally { setBusy(""); }
  };

  const remove = async () => {
    if (!window.confirm("确定删除已保存的 MiMo API Key？")) return;
    setBusy("remove"); setError(""); setMessage("");
    try { await credentialApi.remove(); onCredentialChange({ ...credential, configured: false, lastFour: null }); setMessage("密钥已删除。"); }
    catch (removeError) { setError(removeError.message); }
    finally { setBusy(""); }
  };

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><div><span className="eyebrow">SERVICE PANEL</span><h2 id="settings-title">连接设置</h2></div><button className="dialog-close" onClick={onClose} aria-label="关闭设置"><X size={21} /></button></header>
        <div className="account-strip"><UserCircle size={22} /><span><strong>{user?.name || "Studio User"}</strong><small>{user?.email}</small></span><button onClick={() => authClient.signOut().then(() => window.location.reload())}>退出登录</button></div>
        {user?.role === "admin" && <button className="admin-entry" onClick={onOpenAdmin}><ShieldCheck size={19} weight="duotone" /><span><strong>管理员控制台</strong><small>用户、角色、API 通道与系统健康</small></span><span>OPEN</span></button>}
        <div className="service-display"><span>MIMO API KEY VAULT</span><strong>{credential?.configured === null ? "CHECKING" : credential?.configured ? `•••• ${credential.lastFour}` : "OFFLINE"}</strong><i data-connected={credential?.configured === true ? "true" : "false"} /></div>
        <Field label="MiMo API Base URL" hint="可输入或从管理员批准的通道中选择；仅允许白名单中的 HTTPS 地址。">
          <input type="url" list="mimo-api-endpoints" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.xiaomimimo.com/v1" disabled={credential?.configured === null} />
          <datalist id="mimo-api-endpoints">{(credential?.endpoints || []).map((endpoint) => <option key={endpoint.id} value={endpoint.baseUrl}>{endpoint.name}</option>)}</datalist>
        </Field>
        <div className="endpoint-presets" aria-label="常用 MiMo API 通道">{(credential?.endpoints || []).map((endpoint) => <button key={endpoint.id} type="button" data-active={baseUrl === endpoint.baseUrl ? "true" : "false"} onClick={() => setBaseUrl(endpoint.baseUrl)} disabled={credential?.configured === null}>{endpoint.name}</button>)}</div>
        <Field label={credential?.configured ? "替换 API Key" : "MiMo API Key"} hint="使用 AES-256-GCM 加密后保存到你的账户；明文不会返回浏览器。"><input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder={credential?.configured ? "输入新密钥以替换" : "输入 API Key"} disabled={credential?.configured === null} /></Field>
        {error && <div className="settings-message error" role="alert">{error}</div>}
        {message && <div className="settings-message success" role="status">{message}</div>}
        <div className="vault-actions">
          <button onClick={credential?.configured === null ? refresh : test} disabled={credential?.configured === false || Boolean(busy)}>{credential?.configured === null ? "重新检测" : "测试连接"}</button>
          <button onClick={remove} disabled={!credential?.configured || Boolean(busy)}>删除密钥</button>
        </div>
        <footer><button className="utility-key" onClick={onClose}><X size={17} />关闭</button><button className="save-key" onClick={save} disabled={credential?.configured === null || !baseUrl.trim() || (!credential?.configured && !key.trim()) || Boolean(busy)}>{busy === "save" ? <CircleNotch className="spin" size={18} /> : <Check size={18} weight="bold" />}保存连接</button></footer>
      </section>
    </div>
  );
}

function useCompactViewport() {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function normalizeAudio(item) {
  const durationSeconds = Number(item.durationSeconds || 0);
  return {
    ...item,
    durationSeconds,
    duration: durationSeconds >= 60 ? formatPlaybackTime(durationSeconds).slice(0, 5) : durationSeconds ? `${durationSeconds.toFixed(1)}s` : "--:--",
    time: item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "刚刚",
  };
}

function usePcmStreamPlayer() {
  const [previewing, setPreviewing] = useState(false);
  const contextRef = useRef(null);
  const sourcesRef = useRef(new Set());
  const nextStartRef = useRef(0);
  const finishTimerRef = useRef(0);

  const stop = useCallback(() => {
    window.clearTimeout(finishTimerRef.current);
    sourcesRef.current.forEach((source) => { try { source.stop(); } catch {} });
    sourcesRef.current.clear();
    const context = contextRef.current;
    contextRef.current = null;
    nextStartRef.current = 0;
    if (context && context.state !== "closed") context.close().catch(() => undefined);
    setPreviewing(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("当前浏览器不支持低延迟音频播放。");
    const context = new AudioContextClass({ sampleRate: 24000 });
    contextRef.current = context;
    nextStartRef.current = context.currentTime + 0.06;
    await context.resume();
  }, [stop]);

  const push = useCallback((base64Audio) => {
    const context = contextRef.current;
    if (!context) return;
    const binary = window.atob(base64Audio);
    const sampleCount = Math.floor(binary.length / 2);
    if (!sampleCount) return;
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      const low = binary.charCodeAt(index * 2);
      const high = binary.charCodeAt(index * 2 + 1);
      const value = (high << 8) | low;
      samples[index] = (value >= 0x8000 ? value - 0x10000 : value) / 32768;
    }
    const buffer = context.createBuffer(1, sampleCount, 24000);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.025, nextStartRef.current);
    source.start(startAt);
    nextStartRef.current = startAt + buffer.duration;
    sourcesRef.current.add(source);
    source.onended = () => sourcesRef.current.delete(source);
    setPreviewing(true);
  }, []);

  const finish = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    const remainingMs = Math.max(0, nextStartRef.current - context.currentTime) * 1000 + 80;
    window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(stop, remainingMs);
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { previewing, start, push, finish, stop };
}

function StudioApp({ session }) {
  const compact = useCompactViewport();
  const [mode, setMode] = useState("tts");
  const [text, setText] = useState("真正好的声音，不只是准确地读出文字。它应该保留呼吸、停顿，以及说话人想传达的温度。");
  const [generationMode, setGenerationMode] = useState("preset");
  const [voice, setVoice] = useState(voices[0].id);
  const [delivery, setDelivery] = useState("自然 · 标准语速");
  const [directorInstruction, setDirectorInstruction] = useState("");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [optimizeTextPreview, setOptimizeTextPreview] = useState(true);
  const [cloneFile, setCloneFile] = useState(null);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [format, setFormat] = useState("WAV · PCM16 · 24kHz");
  const [lowLatencyPreview, setLowLatencyPreview] = useState(true);
  const [speed, setSpeed] = useState("natural");
  const [targetDuration, setTargetDuration] = useState("30");
  const [asrLanguage, setAsrLanguage] = useState("auto");
  const [asrFile, setAsrFile] = useState(null);
  const [asrResult, setAsrResult] = useState("");
  const [asrItem, setAsrItem] = useState(null);
  const [asrSaveState, setAsrSaveState] = useState("saved");
  const [busy, setBusy] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const [credential, setCredential] = useState({ configured: null, lastFour: null, endpoints: [] });
  const [notice, setNotice] = useState("");
  const audioRef = useRef(null);
  const requestControllerRef = useRef(null);
  const lastSavedTranscriptRef = useRef("");
  const asrTextRef = useRef("");
  const playMechanicalSound = useMechanicalAudio(soundEnabled);
  const pcmPlayer = usePcmStreamPlayer();
  const refreshCredential = useCallback(async () => {
    const vault = await requestWithRetry(() => credentialApi.status());
    setCredential(vault);
    return vault;
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const status = useMemo(() => pcmPlayer.previewing ? "低延迟实时试听" : busy ? (mode === "asr" ? "识别中" : "生成中") : playing ? "正在播放" : currentAudio ? "音频已装载" : "等待任务", [busy, currentAudio, mode, pcmPlayer.previewing, playing]);

  useEffect(() => {
    let active = true;
    const historyRequest = requestWithRetry(() => audioApi.list())
      .then((library) => { if (active) setHistory((library.items || []).map(normalizeAudio)); });
    const credentialRequest = refreshCredential()
      .catch((error) => {
        if (active) setCredential((current) => ({ ...current, configured: null }));
        throw error;
      });
    Promise.allSettled([historyRequest, credentialRequest]).then((results) => {
      if (!active) return;
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) setNotice(failures.length === 2
        ? "账户数据暂时无法读取，请检查网络后刷新页面。"
        : failures[0].reason?.message || "部分账户数据暂时无法读取，请稍后重试。");
    });
    return () => { active = false; };
  }, [refreshCredential]);

  useEffect(() => {
    const handleCredentialRefresh = () => { refreshCredential().catch(() => {}); };
    window.addEventListener("online", handleCredentialRefresh);
    window.addEventListener("focus", handleCredentialRefresh);
    return () => {
      window.removeEventListener("online", handleCredentialRefresh);
      window.removeEventListener("focus", handleCredentialRefresh);
    };
  }, [refreshCredential]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const updateTime = () => setPlaybackTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const updateDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setPlaybackDuration(audio.duration);
    };
    const ended = () => {
      updateTime();
      setPlaying(false);
    };
    const paused = () => setPlaying(false);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("seeking", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("ended", ended);
    audio.addEventListener("pause", paused);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("seeking", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("pause", paused);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaybackTime(0);
    setPlaybackDuration(Number(currentAudio?.durationSeconds) || 0);
    if (!currentAudio?.playbackUrl) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.src = currentAudio.playbackUrl;
    audio.load();
  }, [currentAudio?.id, currentAudio?.playbackUrl, currentAudio?.durationSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudio?.playbackUrl) return;
    if (playing) {
      if (audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration)) {
        audio.currentTime = 0;
        setPlaybackTime(0);
      }
      audio.play().catch((error) => { setPlaying(false); setNotice(error.message); });
    }
    else audio.pause();
  }, [currentAudio, playing]);

  const seekPlayback = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : playbackDuration;
    const nextTime = Math.min(Math.max(0, Number(seconds) || 0), duration || 0);
    audio.currentTime = nextTime;
    setPlaybackTime(nextTime);
  }, [playbackDuration]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    setPlaying(false);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaybackTime(0);
  }, []);

  useEffect(() => {
    if (!asrItem?.id || asrResult === lastSavedTranscriptRef.current) return undefined;
    setAsrSaveState("saving");
    const timer = window.setTimeout(() => {
      audioApi.updateTranscript(asrItem.id, asrResult)
        .then(() => {
          lastSavedTranscriptRef.current = asrResult;
          setAsrSaveState("saved");
          setHistory((items) => items.map((item) => item.id === asrItem.id ? { ...item, transcript: asrResult } : item));
        })
        .catch((error) => { setAsrSaveState("error"); setNotice(error.message); });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [asrItem?.id, asrResult]);

  const handleAsrFileChange = (file) => {
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!["mp3", "wav"].includes(extension) || file.size > 7_000_000) {
        setNotice("请选择不超过 7 MB 的 MP3 或 WAV 文件。");
        return;
      }
    }
    setAsrFile(file);
    setAsrResult("");
    asrTextRef.current = "";
    setAsrItem(null);
    setAsrSaveState("saved");
    lastSavedTranscriptRef.current = "";
  };

  const copyText = async (value, successMessage) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
    } catch {
      setNotice("浏览器未允许读取剪贴板，请手动选择文本复制。");
    }
  };

  const cancelRequest = () => {
    requestControllerRef.current?.abort();
    pcmPlayer.stop();
    if (mode === "asr" && asrTextRef.current) setAsrSaveState("interrupted");
  };

  const runPrimary = async () => {
    if (credential.configured === null) {
      setNotice("正在确认账户连接状态，请稍候再试。");
      return;
    }
    if (!credential.configured) {
      setNotice("请先在连接设置中保存 MiMo API Key。");
      setSettingsOpen(true);
      return;
    }
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    setBusy(true);
    setPlaying(false);
    setNotice("");
    try {
      let response;
      if (mode === "asr") {
        setAsrResult("");
        asrTextRef.current = "";
        setAsrItem(null);
        setAsrSaveState("streaming");
        lastSavedTranscriptRef.current = "";
        response = await audioApi.transcribeStream(asrFile, asrLanguage, {
          delta: ({ text: delta }) => {
            asrTextRef.current += delta;
            setAsrResult(asrTextRef.current);
          },
        }, controller.signal);
        const transcript = response.transcript || "";
        setAsrResult(transcript);
        asrTextRef.current = transcript;
        setAsrItem(response.item);
        setAsrSaveState("saved");
        lastSavedTranscriptRef.current = transcript;
      } else {
        const selectedFormat = format.startsWith("MP3") ? "mp3" : format.startsWith("PCM") ? "pcm16" : "wav";
        const speedInstruction = speedModes.find((item) => item.id === speed)?.instruction;
        const deliveryInstruction = delivery === "自然 · 标准语速" ? "" : `采用${delivery}的表达方式。`;
        const composedInstruction = [deliveryInstruction, speedInstruction, directorInstruction.trim()].filter(Boolean).join(" ");
        if (mode === "tts" && generationMode === "clone") {
          if (!cloneFile || !cloneConsent) throw new Error("请选择参考音频，并确认你有权使用及克隆该声音。");
          response = await audioApi.generateCloneTts({ text, format: selectedFormat, directorInstruction: composedInstruction, reference: cloneFile, consent: cloneConsent });
        } else if (mode === "tts" && generationMode === "preset" && lowLatencyPreview && !format.startsWith("MP3")) {
          await pcmPlayer.start();
          response = await audioApi.generateTtsStream({
            text,
            generationMode: "preset",
            voice,
            format: "pcm16",
            directorInstruction: composedInstruction,
            mode: "tts",
          }, {
            audio: ({ audio }) => pcmPlayer.push(audio),
          }, controller.signal);
          pcmPlayer.finish();
        } else {
          response = await audioApi.generateTts({
            text,
            generationMode: mode === "timed" ? "preset" : generationMode,
            voice,
            voiceDescription: generationMode === "design" ? voiceDescription.trim() : undefined,
            optimizeTextPreview: generationMode === "design" ? optimizeTextPreview : undefined,
            format: selectedFormat,
            directorInstruction: composedInstruction,
            mode,
            targetDuration: mode === "timed" ? Number(targetDuration) : undefined,
          });
        }
      }
      const item = normalizeAudio(response.item);
      setHistory((items) => [item, ...items]);
      await loadAudio(item, false);
    } catch (error) {
      pcmPlayer.stop();
      if (controller.signal.aborted || error?.name === "AbortError") {
        if (mode === "asr" && asrTextRef.current) setAsrSaveState("interrupted");
        setNotice(mode === "asr" ? "识别已停止，已保留当前收到的文字。" : "语音生成已停止。");
      } else {
        if (mode === "asr") setAsrSaveState("error");
        setNotice(error.message || "请求失败");
      }
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      setBusy(false);
    }
  };

  const loadAudio = async (item, autoplay = false) => {
    setBusy(false);
    setPlaying(false);
    try {
      const result = await audioApi.url(item.id);
      const loaded = { ...item, playbackUrl: result.url };
      setCurrentAudio(loaded);
      if (autoplay) window.setTimeout(() => setPlaying(true), 32);
    } catch (error) { setNotice(error.message); }
  };

  const previewVoice = async () => {
    playMechanicalSound("transportDown", { volume: .2 });
    if (credential.configured === null) return setNotice("正在确认账户连接状态，请稍候再试。");
    if (!credential.configured) return setSettingsOpen(true);
    setBusy(true); setNotice("");
    try {
      const response = await audioApi.generateTts({ text: "真正好的声音，会保留呼吸、停顿和温度。", generationMode: "preset", voice, format: "wav", mode: "tts", directorInstruction: "请自然、温暖地说出这句话。" });
      const item = normalizeAudio(response.item);
      setHistory((items) => [item, ...items]);
      await loadAudio(item, true);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const downloadAudio = async (item) => {
    try {
      const result = await audioApi.url(item.id, true);
      const link = document.createElement("a");
      link.href = result.url;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) { setNotice(error.message); }
  };

  const openTranscript = (item) => {
    setAsrFile({ name: item.title, size: item.sizeBytes || 0, type: item.mimeType || "audio/wav" });
    setAsrItem(item);
    setAsrResult(item.transcript || "");
    lastSavedTranscriptRef.current = item.transcript || "";
    setAsrSaveState("saved");
    setMode("asr");
  };

  const changeMode = (nextMode) => {
    if (busy) cancelRequest();
    setMode(nextMode);
  };

  return (
    <div className="app-shell" data-theme="hybrid">
      <div className="device-upper">
        <ChassisCap />
        <MainHeader mode={mode} />
        <SystemPanel menuOpen={themeMenuOpen} setMenuOpen={setThemeMenuOpen} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} connected={credential.configured} onSettings={() => setSettingsOpen(true)} playSound={playMechanicalSound} />
        <ModeRail active={mode} onChange={changeMode} playSound={playMechanicalSound} compact={compact} />
        <main className="workspace">
          {mode === "history"
            ? <HistoryPanel history={history} filter={historyFilter} onFilter={setHistoryFilter} onLoad={loadAudio} onOpenTranscript={openTranscript} onDownload={downloadAudio} currentAudio={currentAudio} />
            : <EditorPanel mode={mode} text={text} setText={setText} onPrimary={runPrimary} onCancel={cancelRequest} primaryDisabled={mode === "tts" && ((generationMode === "design" && !voiceDescription.trim()) || (generationMode === "clone" && (!cloneFile || !cloneConsent)))} busy={busy} streamPreviewing={pcmPlayer.previewing} currentAudio={currentAudio} asrFile={asrFile} onAsrFileChange={handleAsrFileChange} asrResult={asrResult} onAsrResultChange={setAsrResult} asrSaveState={asrSaveState} onCopyTranscript={() => copyText(asrResult, "识别文本已复制。")} onCopyMarkdown={() => copyText(`# ${asrFile?.name || "语音识别结果"}\n\n${asrResult}`, "Markdown 已复制。")} onReupload={() => handleAsrFileChange(null)} playSound={playMechanicalSound} />}
        </main>
        <div className="right-console">
          <Inspector mode={mode} generationMode={generationMode} setGenerationMode={setGenerationMode} voice={voice} setVoice={setVoice} delivery={delivery} setDelivery={setDelivery} directorInstruction={directorInstruction} setDirectorInstruction={setDirectorInstruction} voiceDescription={voiceDescription} setVoiceDescription={setVoiceDescription} optimizeTextPreview={optimizeTextPreview} setOptimizeTextPreview={setOptimizeTextPreview} cloneFile={cloneFile} setCloneFile={setCloneFile} cloneConsent={cloneConsent} setCloneConsent={setCloneConsent} format={format} setFormat={setFormat} lowLatencyPreview={lowLatencyPreview} setLowLatencyPreview={setLowLatencyPreview} speed={speed} setSpeed={setSpeed} targetDuration={targetDuration} setTargetDuration={setTargetDuration} asrLanguage={asrLanguage} setAsrLanguage={setAsrLanguage} onPreviewVoice={previewVoice} />
        </div>
      </div>
      <Transport busy={busy} previewing={pcmPlayer.previewing} currentAudio={currentAudio} playing={playing} setPlaying={setPlaying} playbackTime={playbackTime} playbackDuration={playbackDuration} onSeek={seekPlayback} onStop={stopPlayback} history={history} onLoad={loadAudio} onDownload={downloadAudio} playSound={playMechanicalSound} />
      <div className="sr-status" aria-live="polite">{status}</div>
      {notice && <button className="app-notice" onClick={() => setNotice("")} aria-label="关闭提示">{notice}<X size={15} /></button>}
      <SettingsDialog open={settingsOpen} onClose={closeSettings} user={session.user} credential={credential} onCredentialChange={setCredential} onCredentialRefresh={refreshCredential} onOpenAdmin={() => { setSettingsOpen(false); setAdminOpen(true); }} />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} currentUser={session.user} />
    </div>
  );
}

export function App() {
  const { data: session, isPending, error } = authClient.useSession();
  if (isPending) return <div className="session-loader"><CircleNotch className="spin" size={25} /><span>WARMING UP STUDIO</span></div>;
  if (error || !session?.user) return <AuthScreen />;
  return <StudioApp session={session} />;
}
