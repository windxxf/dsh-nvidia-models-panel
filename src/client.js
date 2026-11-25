window.__ModuleLoader__.load({
  id: 'dsh-nvidia-models-panel',
  factory(require) {
    const React = require('react');
    const { useState, useCallback, useRef, useEffect } = React;
    const h = React.createElement;

    // 宿主的某些样式会给 input 叠加带正偏移的 inset box-shadow（只在上/左露出），
    // 表现为「上/左边框比右/下粗」。仅靠 <style> 里的 !important 可能被宿主更具体的
    // !important 规则压过；这里用 callback ref 直接在真实 DOM 元素上写「内联 !important」，
    // 内联 !important 的优先级高于任何作者样式表（含 !important），无法被覆盖。
    function nmKeyInputRef(el) {
      if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
      var props = {
        'box-shadow': 'none',
        'outline': 'none',
        '-webkit-appearance': 'none',
        'appearance': 'none',
        'border': '1px solid rgba(128,128,128,0.4)',
        'border-radius': '6px',
        'background': 'transparent',
        'box-sizing': 'border-box',
      };
      for (var k in props) {
        try { el.style.setProperty(k, props[k], 'important'); } catch (e) {}
      }
    }

    const BUILTIN_MODELS = [
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B', description: 'NVIDIA 旗舰推理模型，擅长复杂推理、编码与数学', contextLength: 128000 },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B', description: '超大参数模型，推理与编码能力极强', contextLength: 1000000 },
      { id: 'nvidia/nemotron-3-super-120b-a12b', name: 'Nemotron 3 Super 120B', description: '高性能均衡型，适合企业级日常任务', contextLength: 262144 },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B', description: '轻量高速 MoE 模型，响应快、成本低', contextLength: 262144 },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', name: 'Nemotron 3 Nano Omni 30B', description: '全模态模型，支持文本与图像输入', contextLength: 256000 },
      { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Llama 3.1 Nemotron Ultra 253B', description: 'Llama 3.1 的 NVIDIA 深度优化版本，253B 参数', contextLength: 128000 },
      { id: 'nvidia/cosmos-reason2-8b', name: 'Cosmos Reason2 8B', description: '物理世界推理模型，面向机器人与视频理解', contextLength: 131072 },
      { id: 'deepseek-ai/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', description: 'DeepSeek 高速版，长上下文，支持文本与图像', contextLength: 1000000 },
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3', description: '月之暗面旗舰模型，百万级上下文窗口', contextLength: 1048576 },
      { id: 'z-ai/glm-5.3', name: 'GLM-5.3', description: '智谱旗舰大模型，强推理与长上下文', contextLength: 1000000 },
    ];

    const VERIFY_CONCURRENCY = 6;

    // NVIDIA NIM API Key 官方申请地址 + 悬停注册步骤提示。
    const NVIDIA_KEY_URL = 'https://build.nvidia.com/settings/api-keys';
    const NVIDIA_KEY_HINT = [
      '如何获取 NVIDIA API Key：',
      '1. 打开 build.nvidia.com，用 NVIDIA 开发者账号登录（免费，可能需要手机验证）',
      '2. 进入头像菜单 → Settings → API Keys（或 build.nvidia.com/settings/api-keys）',
      '3. 点击 Generate API Key，名称自定义，务必勾选 Public API Endpoints 权限',
      '4. 复制以 nvapi- 开头的 Key（只显示一次），粘贴到下方输入框并保存',
      '（点此徽标可直接打开申请页面）',
    ].join('\n');

    function NvidiaPanelIcon(props) {
      const active = !!(props && props.active);
      return h('button', {
        onClick: props && props.onClick,
        'aria-label': 'NVIDIA 模型',
        title: 'NVIDIA 模型',
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: active ? '#76B900' : 'inherit',
        },
      }, h('svg', {
        viewBox: '0 0 24 24',
        width: 20,
        height: 20,
        fill: 'currentColor',
        'aria-hidden': 'true',
      }, h('path', { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' })));
    }

    /** Badge for one model's probe result. */
    function statusBadge(result) {
      if (!result) {
        return h('span', { style: { fontSize: '11px', opacity: 0.5, border: '1px solid rgba(128,128,128,0.35)', borderRadius: '4px', padding: '1px 6px' } }, '未试调用');
      }
      if (result.status === 'testing') {
        return h('span', { style: { fontSize: '11px', color: '#b8860b', border: '1px solid #b8860b', borderRadius: '4px', padding: '1px 6px' } }, '试调用中…');
      }
      if (result.status === 'ok') {
        return h('span', { style: { fontSize: '11px', color: '#2e7d32', border: '1px solid #2e7d32', borderRadius: '4px', padding: '1px 6px', background: 'rgba(46,125,50,0.10)' } }, '可用 ✓');
      }
      if (result.status === 'skip') {
        return h('span', { style: { fontSize: '11px', opacity: 0.6, border: '1px dashed rgba(128,128,128,0.5)', borderRadius: '4px', padding: '1px 6px' } }, '跳过');
      }
      return h('span', { style: { fontSize: '11px', color: '#c62828', border: '1px solid #c62828', borderRadius: '4px', padding: '1px 6px', background: 'rgba(198,40,40,0.08)' } }, '不可用');
    }

    /** Badge for one group member's live health status. */
    function groupBadge(status) {
      const map = {
        ok: { c: '#2e7d32', t: '健康 ✓' },
        failed: { c: '#c62828', t: '故障' },
        unknown: { c: '#8a8a8a', t: '未知' },
      };
      const s = map[status] || map.unknown;
      return h('span', {
        style: { fontSize: '11px', color: s.c, border: '1px solid ' + s.c, borderRadius: '4px', padding: '1px 6px' },
      }, s.t);
    }

    /**
     * 输入框 dock 徽标：显示模型组最近真正出正文的模型 + 切换/熔断计数。
     * 独立 React 树，自己轮询 /api/nvidia-models 的 dockStatus（3 秒一次）。
     * 未使用模型组时（active=false）完全不渲染，平时不打扰。
     */
    function DockBadge(props) {
      const [status, setStatus] = useState(null);
      const btnRef = useRef(null);

      // 运行时实测对齐：dock 槽位容器的真实宽度/缩进由宿主 CSS 决定，静态猜 CSS 变量不可靠。
      // 直接测量输入框 card 的实际右边缘，动态设置 marginRight 让徽标右边缘与它重合。
      useEffect(function () {
        if (!status || !status.active) return;
        var cancelled = false;
        function findCard(input) {
          var el = input;
          while (el && el !== document.body) {
            var r = el.getBoundingClientRect();
            var cs = window.getComputedStyle(el);
            if (r.width > 400 && r.width <= window.innerWidth - 16 &&
                parseFloat(cs.borderTopLeftRadius) >= 10) return el;
            el = el.parentElement;
          }
          return null;
        }
        function align() {
          if (cancelled) return;
          var btn = btnRef.current;
          var input = document.querySelector('[data-composer-input]');
          if (!btn || !input) return;
          var card = findCard(input);
          if (!card) return;
          // btn.right = 容器右缘 - marginRight。要让 btn.right 追上 card.right（增量 = card.right - btn.right），
          // 需把 marginRight 减去同样的增量（marginRight 越大按钮越靠左）。
          var delta = card.getBoundingClientRect().right - btn.getBoundingClientRect().right;
          if (Math.abs(delta) >= 1) {
            var cur = parseFloat(window.getComputedStyle(btn).marginRight) || 0;
            btn.style.marginRight = (cur - delta) + 'px';
          }
        }
        var n = 0;
        var raf;
        function converge() { align(); if (++n < 10) raf = requestAnimationFrame(converge); }
        converge();
        var timer = setInterval(align, 2000);
        return function () { cancelled = true; cancelAnimationFrame(raf); clearInterval(timer); };
      }, [status && status.active]);

      const sessionId = props && props.sessionId;
      const refresh = useCallback(async function () {
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'dockStatus', sessionId: sessionId || undefined }),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (data && data.ok) setStatus(data);
        } catch {
          // best-effort
        }
      }, [sessionId]);

      useEffect(function () {
        refresh();
        const id = setInterval(refresh, 3000);
        return function () { clearInterval(id); };
      }, [refresh]);

      if (!status || !status.active) return null;

      const name = status.memberName || status.memberId || '模型组';
      const justSwitched = Boolean(status.switchFrom);
      const label = justSwitched
        ? ('⚡ ' + name + ' ← 从 ' + status.switchFrom + ' 切换 · 切换 ' + status.switchCount + ' 次')
        : ('⚡ ' + name + ' · 切换 ' + status.switchCount + ' 次 · 熔断 ' + status.cooldownCount);

      const openUsage = function () {
        try {
          window.dispatchEvent(new CustomEvent('nvidia-models-open-usage'));
        } catch { /* 忽略：面板可能未挂载 */ }
      };

      // dock 容器（._7yHdaG_dock）相对输入框两边各缩进了 2×--dsh-composer-dock-inset：
      //   max-width = card-max - 2×inset，padding = 0 inset，margin 0 auto
      // 所以 dock 内容区右边缘比输入框右边缘靠左 2×inset（默认 16px）。
      // 用 flex-end 靠右后，再给徽标一个负 margin-right = -2×inset 抵消这段缩进，
      // 右边缘就与输入框右边缘像素级对齐。不用 absolute（外层空 div 高度会塌缩成 0）。
      return h('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          width: '100%',
          boxSizing: 'border-box',
        },
      }, h('button', {
        ref: btnRef,
        type: 'button',
        onClick: openUsage,
        title: '查看 NVIDIA 模型组调用日志',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          lineHeight: '1.2',
          color: justSwitched ? '#e65100' : '#8fce00',
          border: '1px solid ' + (justSwitched ? 'rgba(230,81,0,0.55)' : 'rgba(143,206,0,0.5)'),
          background: justSwitched ? 'rgba(230,81,0,0.10)' : 'rgba(143,206,0,0.08)',
          borderRadius: '999px',
          padding: '2px 10px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          maxWidth: '420px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          height: '32px',
          boxSizing: 'border-box',
          flexShrink: 0,
          marginRight: 'calc(-2 * var(--dsh-composer-dock-inset, 8px))',
        },
      }, label));
    }

    /** 黄色警示条：未配置 Key 时在关键位置提示用户先去保存 Key。 */
    function noKeyWarning(message) {
      return h('div', {
        style: {
          padding: '8px 10px',
          background: 'rgba(230,150,0,0.12)',
          border: '1px solid rgba(230,150,0,0.55)',
          borderRadius: '6px',
          fontSize: '12px',
          lineHeight: 1.5,
          color: '#b8860b',
        },
      }, message);
    }

    function NvidiaModelsPanel(props) {
      const [models, setModels] = useState([]);
      const [detecting, setDetecting] = useState(false);
      const [verifying, setVerifying] = useState(false);
      const [message, setMessage] = useState('');
      const [results, setResults] = useState({});
      const [tab, setTab] = useState('models');
      const cancelRef = useRef(false);

      const onClose = props && props.onClose;

      // ---- API key management ----
      const [keyInput, setKeyInput] = useState('');
      const [keyStatus, setKeyStatus] = useState(null);
      const [keyBusy, setKeyBusy] = useState(false);
      const [keyMsg, setKeyMsg] = useState('');

      const refreshKeyStatus = useCallback(async function () {
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'keyStatus' }),
          });
          if (!response.ok) return;
          const data = await response.json();
          setKeyStatus(data);
        } catch {
          // Status check is best-effort; the panel still works without it.
        }
      }, []);

      useEffect(function () { refreshKeyStatus(); }, [refreshKeyStatus]);

      const saveKey = useCallback(async function () {
        const key = keyInput.trim();
        if (!key) { setKeyMsg('请先输入 API Key'); return; }
        setKeyBusy(true);
        setKeyMsg('保存中…');
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'setKey', key }),
          });
          const data = await response.json();
          if (data && data.saved) {
            setKeyInput('');
            setKeyMsg('已保存到凭据存储（不进入配置文件）。正式 nvidia 模型路由下一次请求即生效，现在可以点「逐个试调用」。');
            await refreshKeyStatus();
          } else {
            setKeyMsg('保存失败：' + ((data && data.error) || ('HTTP ' + response.status)));
          }
        } catch (error) {
          setKeyMsg('保存请求失败：' + String((error && error.message) || error));
        } finally {
          setKeyBusy(false);
        }
      }, [keyInput, refreshKeyStatus]);

      const clearKey = useCallback(async function () {
        setKeyBusy(true);
        setKeyMsg('清除中…');
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'clearKey' }),
          });
          const data = await response.json();
          if (data && data.cleared) {
            setKeyMsg('已清除存储的 Key（环境变量 NVIDIA_API_KEY 若存在将重新生效）。');
            await refreshKeyStatus();
          } else {
            setKeyMsg('清除失败：' + ((data && data.error) || ('HTTP ' + response.status)));
          }
        } catch (error) {
          setKeyMsg('清除请求失败：' + String((error && error.message) || error));
        } finally {
          setKeyBusy(false);
        }
      }, [refreshKeyStatus]);

      const setOne = useCallback(function (id, patch) {
        setResults(function (prev) {
          const next = { ...prev };
          next[id] = { ...(prev[id] || {}), ...patch };
          return next;
        });
      }, []);

      const detectModels = useCallback(async function () {
        setDetecting(true);
        setMessage('正在实时查询 NVIDIA API…');
        setResults({});
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'detect' }),
          });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          if (data && data.source === 'live' && Array.isArray(data.models)) {
            setModels(data.models);
            setMessage('实时检测到 ' + data.count + ' 个模型（来自 NVIDIA API）。点击「逐个试调用」验证每个模型真实可用性。');
          } else {
            setModels((data && data.models) || BUILTIN_MODELS);
            setMessage((data && data.reason ? data.reason + '，' : '') + '已显示内置目录。');
          }
        } catch (error) {
          setModels(BUILTIN_MODELS);
          setMessage('检测请求失败：' + String((error && error.message) || error) + '，已显示内置目录。');
        } finally {
          setDetecting(false);
        }
      }, []);

      /** Probe every listed model (shared by the verify button and configure). */
      const runVerification = useCallback(async function (list) {
        setVerifying(true);
        cancelRef.current = false;
        const queue = list.map(function (m) { return m.id; });
        const finalResults = {};
        let done = 0;
        const total = list.length;
        setResults({});
        for (const id of queue) { finalResults[id] = { status: 'testing' }; setOne(id, { status: 'testing' }); }
        setMessage('逐个试调用中（并发 ' + VERIFY_CONCURRENCY + '，流式首包判定）… 0/' + total);

        async function worker() {
          for (;;) {
            if (cancelRef.current) return;
            const id = queue.shift();
            if (!id) return;
            let outcome;
            try {
              const response = await fetch('/api/nvidia-models', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'test', model: id }),
              });
              if (!response.ok) {
                outcome = { status: 'fail', detail: '检测请求失败（HTTP ' + response.status + '）' };
              } else {
                const data = await response.json();
                outcome = { status: data.status, detail: data.detail };
              }
            } catch (error) {
              outcome = { status: 'fail', detail: '检测请求异常：' + String((error && error.message) || error) };
            }
            finalResults[id] = outcome;
            setOne(id, outcome);
            done += 1;
            setMessage('逐个试调用中… ' + done + '/' + total);
          }
        }

        const workers = [];
        for (let i = 0; i < VERIFY_CONCURRENCY; i += 1) workers.push(worker());
        await Promise.all(workers);
        setVerifying(false);
        return finalResults;
      }, [setOne]);

      const verifyAll = useCallback(async function () {
        if (verifying || models.length === 0) return;
        const finalResults = await runVerification(models);
        const done = Object.keys(finalResults).length;
        if (cancelRef.current) {
          setMessage('试调用已手动停止（完成 ' + done + '/' + models.length + '）。');
          return;
        }
        const okCount = Object.values(finalResults).filter(function (r) { return r && r.status === 'ok'; }).length;
        setMessage('试调用完成：' + done + ' 个模型，其中 ' + okCount + ' 个真实可用。点「一键配置到设置」把可用模型写入设置。');
      }, [models, verifying, runVerification]);

      const [configuring, setConfiguring] = useState(false);

      /** One click: probe (if not yet done) then write ONLY the available models. */
      const configureModels = useCallback(async function () {
        if (configuring) return;
        if (models.length === 0) {
          setMessage('请先点「检测可用模型」获取列表。');
          return;
        }
        setConfiguring(true);
        const tested = Object.keys(results).filter(function (id) {
          return results[id] && results[id].status !== 'testing';
        }).length;
        let finalResults = results;
        if (tested < models.length) {
          setMessage('尚未完成试调用——先自动逐个试调用，再写入可用模型…');
          finalResults = await runVerification(models);
          if (cancelRef.current) {
            setMessage('试调用被手动停止，已中止配置。可再次点击继续。');
            setConfiguring(false);
            return;
          }
        }
        const probePayload = {};
        for (const id of Object.keys(finalResults)) {
          probePayload[id] = finalResults[id] && finalResults[id].status === 'ok' ? 'ok' : 'unavailable';
        }
        const okCount = Object.values(finalResults).filter(function (r) { return r && r.status === 'ok'; }).length;
        setMessage('正在把 ' + okCount + ' 个可用模型写入设置…');
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'configure', results: probePayload }),
          });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          if (data && data.ok) {
            setMessage(data.message || '已写入设置。');
            // 配置会改写 nvidia 供应商的模型列表，也即模型组的成员来源；
            // 立即刷新健康看板并切到「模型组健康」页，让用户马上看到新成员。
            try { await refreshGroup(); } catch { /* best-effort */ }
            setTab('group');
          } else {
            setMessage('配置失败：' + ((data && data.error) || '未知错误'));
          }
        } catch (error) {
          setMessage('配置请求失败：' + String((error && error.message) || error));
        } finally {
          setConfiguring(false);
        }
      }, [configuring, models, results, runVerification]);

      const stopVerify = useCallback(function () {
        cancelRef.current = true;
      }, []);

      // ---- model group health dashboard ----
      const [group, setGroup] = useState(null);
      const [groupBusy, setGroupBusy] = useState(false);
      const [groupMsg, setGroupMsg] = useState('');

      const refreshGroup = useCallback(async function () {
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'groupStatus' }),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (data && data.ok) setGroup(data);
        } catch {
          // best-effort
        }
      }, []);

      useEffect(function () { refreshGroup(); }, [refreshGroup]);

      const probeGroupNow = useCallback(async function () {
        if (groupBusy) return;
        setGroupBusy(true);
        setGroupMsg('正在探测模型组内每个成员（首包判定）…');
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'probeGroup' }),
          });
          const data = await response.json();
          const okCount = (data && data.results) ? data.results.filter(function (r) { return r && r.status === 'ok'; }).length : 0;
          setGroupMsg('探测完成：' + (data.probed || 0) + ' 个成员，其中 ' + okCount + ' 个可用。');
          await refreshGroup();
        } catch (error) {
          setGroupMsg('探测请求失败：' + String((error && error.message) || error));
        } finally {
          setGroupBusy(false);
        }
      }, [groupBusy, refreshGroup]);

      const resetGroupHealth = useCallback(async function (model) {
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'resetGroup', model: model || '' }),
          });
          const data = await response.json();
          if (data && data.ok) setGroup(data);
          setGroupMsg(model ? ('已重置 ' + model + ' 的熔断状态。') : '已重置全部成员的熔断状态。');
        } catch (error) {
          setGroupMsg('重置失败：' + String((error && error.message) || error));
        }
      }, []);

      const groupCard = h('div', {
        key: 'group',
        style: {
          padding: '12px',
          background: 'rgba(118,185,0,0.06)',
          border: '1px solid rgba(118,185,0,0.35)',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
          h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '模型组健康看板（自愈故障转移）'),
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('button', {
              onClick: probeGroupNow,
              disabled: groupBusy,
              style: { padding: '5px 10px', fontSize: '12px', background: '#76B900', color: '#fff', border: 'none', borderRadius: '5px', cursor: groupBusy ? 'wait' : 'pointer', opacity: groupBusy ? 0.6 : 1 },
            }, groupBusy ? '探测中…' : '探测模型组'),
            h('button', {
              onClick: refreshGroup,
              style: { padding: '5px 10px', fontSize: '12px', background: 'transparent', border: '1px solid rgba(128,128,128,0.4)', color: 'inherit', borderRadius: '5px', cursor: 'pointer' },
            }, '刷新')
          )
        ),
        h('p', { style: { margin: 0, fontSize: '11px', opacity: 0.7, lineHeight: 1.5 } },
          '选中「NVIDIA 模型组」后，请求按健康度顺序尝试组内模型；首个成员超过 ' +
          ((group && group.config && group.config.firstByteTimeoutMs ? Math.round(group.config.firstByteTimeoutMs / 1000) : 15)) +
          ' 秒无首包会立即切下一个；连续失败自动熔断冷却。'),
        groupMsg ? h('p', { style: { margin: 0, fontSize: '12px', lineHeight: 1.5 } }, groupMsg) : null,
        (group && Array.isArray(group.members) && group.members.length > 0)
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              group.members.map(function (m) {
                const cooling = m.cooldownRemainingMs > 0;
                return h('div', {
                  key: m.id,
                  style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '6px 8px', background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '5px' },
                },
                  h('span', { style: { fontWeight: 600, fontSize: '12px' } }, m.name || m.id),
                  groupBadge(m.status),
                  cooling ? h('span', { style: { fontSize: '11px', color: '#b8860b' } }, '熔断中 · 剩余 ' + Math.ceil(m.cooldownRemainingMs / 1000) + 's') : null,
                  m.lastFirstByteMs !== null && m.lastFirstByteMs !== undefined ? h('span', { style: { fontSize: '11px', opacity: 0.65 } }, '首包 ' + m.lastFirstByteMs + 'ms') : null,
                  m.failCount > 0 ? h('span', { style: { fontSize: '11px', opacity: 0.65 } }, '失败 ' + m.failCount + ' 次') : null,
                  (cooling || m.failCount > 0) ? h('button', {
                    onClick: function () { resetGroupHealth(m.id); },
                    style: { marginLeft: 'auto', padding: '3px 8px', fontSize: '11px', background: 'transparent', border: '1px solid rgba(128,128,128,0.4)', color: 'inherit', borderRadius: '4px', cursor: 'pointer' },
                  }, '重置') : null,
                  m.lastError ? h('span', { style: { fontSize: '11px', color: '#c62828', flexBasis: '100%' } }, String(m.lastError).slice(0, 160)) : null
                );
              })
            )
          : h('p', { style: { margin: 0, fontSize: '12px', opacity: 0.6 } },
              '组内暂无模型：先在下方「检测可用模型 → 逐个试调用 → 一键配置到设置」写入至少一个可用模型。'),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' } },
          h('span', { style: { fontSize: '11px', opacity: 0.7, alignSelf: 'center' } }, '在对话框模型选择器里选择「NVIDIA 模型组（自动）」即可交由模型组自动选优与故障转移。'),
          h('button', {
            onClick: function () { resetGroupHealth(''); },
            style: { padding: '3px 8px', fontSize: '11px', background: 'transparent', border: '1px solid rgba(128,128,128,0.4)', color: 'inherit', borderRadius: '4px', cursor: 'pointer' },
          }, '重置全部熔断')
        )
      );

      // ---- daily usage log (调用日志) ----
      const [usage, setUsage] = useState(null);
      const [usageBusy, setUsageBusy] = useState(false);
      const [usageMsg, setUsageMsg] = useState('');
      // 「?」使用说明弹窗开关（方案 A：标题栏入口 + 居中浮层）
      const [helpOpen, setHelpOpen] = useState(false);
      // ---- 新版本检测 ----
      const [updateInfo, setUpdateInfo] = useState(null);
      const [updateBusy, setUpdateBusy] = useState(false);
      // 「未配置」徽标的自定义悬停步骤浮层（原生 title 在 Tauri webview 里常不渲染）
      const [keyTipOpen, setKeyTipOpen] = useState(false);

      const refreshUsage = useCallback(async function () {
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'usageStats' }),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (data && data.ok) setUsage(data.stats);
        } catch {
          // best-effort
        }
      }, []);

      const refreshUpdateCheck = useCallback(async function () {
        if (updateBusy) return;
        setUpdateBusy(true);
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'checkUpdate' }),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (data && data.ok) setUpdateInfo(data);
        } catch {
          // best-effort
        } finally {
          setUpdateBusy(false);
        }
      }, []);

      // Check once on mount.
      useEffect(function () { refreshUpdateCheck(); }, [refreshUpdateCheck]);

      // 输入框 dock 徽标点击后，切到「调用日志」标签页。
      useEffect(function () {
        function onOpenUsage() { setTab('usage'); }
        try {
          window.addEventListener('nvidia-models-open-usage', onOpenUsage);
          return function () { window.removeEventListener('nvidia-models-open-usage', onOpenUsage); };
        } catch {
          return undefined;
        }
      }, []);

      // Refresh when the user switches to the usage tab.
      useEffect(function () {
        if (tab === 'usage') refreshUsage();
      }, [tab, refreshUsage]);

      const resetUsageToday = useCallback(async function () {
        if (usageBusy) return;
        setUsageBusy(true);
        try {
          const response = await fetch('/api/nvidia-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'resetUsage' }),
          });
          const data = await response.json();
          if (data && data.ok) setUsage(data.stats);
          setUsageMsg('已清空当日统计。');
        } catch (error) {
          setUsageMsg('清空失败：' + String((error && error.message) || error));
        } finally {
          setUsageBusy(false);
        }
      }, [usageBusy]);

      const fmtTokens = function (n) {
        const v = Number(n) || 0;
        if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
        return String(v);
      };
      const fmtTime = function (ts) {
        if (!ts) return '';
        try {
          const d = new Date(ts);
          const p = function (x) { return String(x).padStart(2, '0'); };
          return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
        } catch { return ''; }
      };
      const statBox = function (label, value, color) {
        return h('div', {
          key: 'stat-' + label,
          style: { flex: '1 1 0', minWidth: '74px', padding: '8px', background: 'rgba(128,128,128,0.08)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '5px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' },
        },
          h('span', { style: { fontSize: '10px', opacity: 0.65 } }, label),
          h('span', { style: { fontSize: '15px', fontWeight: 600, color: color || 'inherit' } }, value)
        );
      };

      const usageTotal = (usage && usage.total) || { calls: 0, ok: 0, fail: 0, failovers: 0, inputTokens: 0, outputTokens: 0 };
      const usageMembers = (usage && Array.isArray(usage.members)) ? usage.members : [];
      const usageLog = (usage && Array.isArray(usage.log)) ? usage.log : [];

      const usageCard = h('div', {
        key: 'usage',
        style: { padding: '12px', background: 'rgba(118,185,0,0.06)', border: '1px solid rgba(118,185,0,0.35)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '10px' },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
          h('span', { style: { fontSize: '13px', fontWeight: 600 } }, '当天模型组调用日志' + (usage && usage.day ? '（' + usage.day + '）' : '')),
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('button', {
              onClick: refreshUsage,
              style: { padding: '5px 10px', fontSize: '12px', background: '#76B900', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' },
            }, '刷新'),
            h('button', {
              onClick: resetUsageToday,
              disabled: usageBusy,
              style: { padding: '5px 10px', fontSize: '12px', background: 'transparent', border: '1px solid rgba(128,128,128,0.4)', color: 'inherit', borderRadius: '5px', cursor: usageBusy ? 'wait' : 'pointer' },
            }, '清空当日统计')
          )
        ),
        usageMsg ? h('p', { style: { margin: 0, fontSize: '12px', lineHeight: 1.5 } }, usageMsg) : null,
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          statBox('总调用', String(usageTotal.calls)),
          statBox('成功', String(usageTotal.ok), '#2e7d32'),
          statBox('失败', String(usageTotal.fail), usageTotal.fail ? '#c62828' : 'inherit'),
          statBox('自动切换', String(usageTotal.failovers), usageTotal.failovers ? '#b8860b' : 'inherit'),
          statBox('输入 token', fmtTokens(usageTotal.inputTokens)),
          statBox('输出 token', fmtTokens(usageTotal.outputTokens))
        ),
        usageMembers.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              usageMembers.map(function (m) {
                return h('div', {
                  key: 'um-' + m.id,
                  style: { display: 'flex', flexDirection: 'column', gap: '3px', padding: '6px 8px', background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.18)', borderRadius: '4px' },
                },
                  h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline' } },
                    h('span', { style: { flex: '1 1 auto', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(m.id).replace(/^nvidia\//, '')),
                    m.failovers ? h('span', { style: { fontSize: '11px', color: '#b8860b', flex: '0 0 auto' } }, '切换 ' + m.failovers + ' 次') : h('span', { style: { fontSize: '11px', opacity: 0.6, flex: '0 0 auto' } }, '共 ' + m.calls + ' 次')
                  ),
                  h('div', { style: { display: 'flex', gap: '10px', fontSize: '11px', flexWrap: 'wrap', opacity: 0.85 } },
                    h('span', { style: { color: '#2e7d32' } }, '✓ ' + m.ok),
                    m.fail ? h('span', { style: { color: '#c62828' } }, '✗ ' + m.fail) : null,
                    h('span', null, '平均首包 ' + (m.avgFirstByteMs ? m.avgFirstByteMs + 'ms' : '—')),
                    h('span', null, 'token ' + fmtTokens(m.inputTokens + m.outputTokens))
                  )
                );
              })
            )
          : h('p', { style: { margin: 0, fontSize: '12px', opacity: 0.6 } }, '今天还没有调用记录。在对话框模型选择器里选中「NVIDIA 模型组」并发起一轮对话即可产生记录。'),
        usageLog.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '260px', overflow: 'auto' } },
              h('div', { style: { fontSize: '11px', opacity: 0.6, padding: '0 6px' } }, '最近调用（最新在上，最多 200 条）'),
              usageLog.map(function (e, i) {
                return h('div', {
                  key: 'ul-' + i,
                  style: { display: 'flex', fontSize: '11px', gap: '8px', padding: '4px 6px', background: 'rgba(128,128,128,0.05)', borderLeft: '3px solid ' + (e.ok ? '#76B900' : '#c62828'), alignItems: 'center', flexWrap: 'wrap' },
                },
                  h('span', { style: { flex: '0 0 58px', opacity: 0.6 } }, fmtTime(e.at)),
                  h('span', { style: { fontWeight: 600 } }, e.ok ? '✓' : '✗'),
                  h('span', { style: { flex: '1 1 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(e.memberId).replace(/^nvidia\//, '')),
                  e.failover ? h('span', { style: { fontSize: '10px', color: '#b8860b' } }, '← 切换自 ' + String(e.failoverFrom || '').replace(/^nvidia\//, '')) : null,
                  e.ok ? h('span', { style: { opacity: 0.7 } }, '首包 ' + (e.firstByteMs || 0) + 'ms') : null,
                  (e.inputTokens || e.outputTokens) ? h('span', { style: { opacity: 0.7 } }, 'tok ' + fmtTokens(e.inputTokens) + '/' + fmtTokens(e.outputTokens)) : null,
                  e.error ? h('span', { style: { flexBasis: '100%', color: '#c62828', fontSize: '10px' } }, String(e.error).slice(0, 140)) : null
                );
              })
            )
          : null
      );

      // Tab bar — keeps actions + list on the "模型库" tab, the health
      // dashboard on its own tab, and the daily usage log on a third, so the
      // primary buttons are never pushed off the bottom of the panel.
      const tabButton = function (id, label) {
        const active = tab === id;
        return h('button', {
          key: id,
          onClick: function () { setTab(id); },
          style: {
            padding: '7px 14px',
            fontSize: '13px',
            fontWeight: active ? 600 : 500,
            background: 'transparent',
            color: 'inherit',
            border: 'none',
            borderBottom: active ? '2px solid #76B900' : '2px solid transparent',
            cursor: 'pointer',
            opacity: active ? 1 : 0.62,
            marginBottom: '-1px',
          },
        }, label);
      };
      const tabBar = h('div', {
        key: 'tabs',
        style: { display: 'flex', gap: '2px', borderBottom: '1px solid rgba(128,128,128,0.3)' },
      }, [tabButton('models', '模型库'), tabButton('group', '模型组健康'), tabButton('usage', '调用日志')]);

      // ---- 使用说明（方案 A：标题栏「?」→ 居中浮层）----
      const helpRow = function (label, text) {
        return h('div', { style: { display: 'flex', gap: '8px', fontSize: '12px', lineHeight: 1.55 } },
          h('span', { style: { flex: '0 0 66px', fontWeight: 600, color: '#8fce00' } }, label),
          h('span', { style: { flex: '1 1 auto', opacity: 0.9 } }, text)
        );
      };
      const helpStep = function (n, title, text) {
        return h('div', { key: 'help-step-' + n, style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
          h('span', {
            style: { flex: '0 0 20px', height: '20px', borderRadius: '50%', background: '#76B900', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' },
          }, String(n)),
          h('span', { style: { flex: '1 1 auto', fontSize: '12.5px', lineHeight: 1.55 } },
            h('b', { style: { color: 'inherit' } }, title), '：', text)
        );
      };
      const helpModal = !helpOpen ? null : h('div', {
        key: 'help-overlay',
        onClick: function (e) { if (e.target === e.currentTarget) setHelpOpen(false); },
        style: {
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '24px 12px', overflow: 'auto',
        },
      },
        h('div', {
          role: 'dialog',
          'aria-label': '使用说明',
          style: {
            width: '100%', maxWidth: '348px',
            background: 'var(--dsh-surface, #1b1d20)',
            color: 'inherit',
            border: '1px solid rgba(128,128,128,0.35)',
            borderRadius: '10px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            padding: '16px',
            display: 'flex', flexDirection: 'column', gap: '12px',
            flex: '0 0 auto',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('span', { style: { fontSize: '15px', fontWeight: 700 } }, '使用说明'),
            h('button', {
              onClick: function () { setHelpOpen(false); },
              'aria-label': '关闭使用说明',
              style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', padding: '2px' },
            }, h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'currentColor', 'aria-hidden': 'true' },
              h('path', { d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' })))
          ),
          keyStatus && !keyStatus.configured
            ? h('div', { style: { fontSize: '12px', color: '#b8860b', border: '1px solid rgba(184,134,11,0.5)', background: 'rgba(184,134,11,0.08)', borderRadius: '6px', padding: '7px 10px', lineHeight: 1.5 } },
                '尚未配置 NVIDIA API Key —— 请先在上方「NVIDIA API Key」卡片粘贴保存后再继续。')
            : null,
          helpStep(1, '配置 Key', '粘贴 nvapi-… Key 并保存，即与正式 nvidia 路由共用凭据，不会写入配置文件或日志。'),
          helpStep(2, '检测 → 验证 → 一键配置', '在「模型库」点「检测可用模型」，再「逐个试调用」，最后「一键配置到设置」；只有试调用通过的模型会写入 llm-pi-ai 路由。'),
          helpStep(3, '启用自动故障转移', '在对话框模型选择器里选「NVIDIA 模型组（自动）」，请求会按实时健康排序并自动切换，无需指定首选模型。'),
          helpStep(4, '看效果', '「模型组健康」页看熔断状态与各成员首包用时；「调用日志」页看当天总用量、各模型使用量与每次自动切换记录。'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(128,128,128,0.25)', paddingTop: '10px' } },
            h('span', { style: { fontSize: '12px', fontWeight: 700 } }, '机制要点'),
            helpRow('故障转移', '选中成员首包超过 15 秒无响应即立刻切下一个；已有内容输出后不再切换，避免前后不连贯。'),
            helpRow('熔断冷却', '某成员连续失败进入冷却，20 秒起指数退避、最长 5 分钟，冷却结束后自动恢复。'),
            helpRow('能力路由', '带图片的请求只会分给支持视觉的成员（vision / vl / omni）。'),
            helpRow('自发现', '后台每 5 分钟刷新一次模型列表，新增可用模型自动进组。'),
            helpRow('token 计数', '上游未回传 usage 时 token 显示为 0，不影响调用本身。')
          )
        )
      );

      // 未配置 Key：主操作按钮禁用、关键位置给出就地提示（凭据服务不可用时不做拦截）。
      const noKey = Boolean(keyStatus && !keyStatus.configured && !keyStatus.unavailable);
      const keyHint = '尚未配置 NVIDIA API Key —— 请先在上方「NVIDIA API Key」卡片粘贴保存后再继续。';

      return h('div', {
        className: 'nvidia-models-panel',
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '16px',
          boxSizing: 'border-box',
          background: 'transparent',
          color: 'inherit',
          overflow: 'auto',
          gap: '12px',
          position: 'relative',
        },
      },
        // 宿主样式会给 input 叠加带正偏移的 inset box-shadow（只在上/左露出），
        // 表现为「上/左边框比右/下粗」。这里用只作用于本输入框唯一类名的
        // 作用域样式把 box-shadow/outline/appearance 清零——不影响面板其它元素。
        h('style', { key: 'nm-key-input-reset' },
          '.nvidia-models-panel input.nm-key-input,' +
          '.nvidia-models-panel input.nm-key-input:focus,' +
          '.nvidia-models-panel input.nm-key-input:focus-visible,' +
          '.nvidia-models-panel input.nm-key-input:hover{' +
          'box-shadow:none!important;outline:none!important;' +
          '-webkit-appearance:none!important;appearance:none!important;' +
          'border:1px solid rgba(128,128,128,0.4)!important;border-radius:6px!important;}'),

        h('div', {
          key: 'header',
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(128,128,128,0.3)',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('svg', {
              viewBox: '0 0 24 24',
              width: 22,
              height: 22,
              fill: '#76B900',
              'aria-hidden': 'true',
            }, h('path', { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' })),
            h('h2', { style: { margin: 0, fontSize: '16px', fontWeight: 600 } }, 'NVIDIA 模型'),
            (function () {
              const info = updateInfo;
              const hasUpdate = Boolean(info && info.hasUpdate);
              const failed = Boolean(info && info.reachable === false && !hasUpdate);
              const currentVersion = info && info.currentVersion ? String(info.currentVersion).replace(/^v/, '') : null;
              let label, color;
              if (hasUpdate) {
                label = '新版本 ↑ ' + (info.latestTag || '');
                color = '230,170,0';
              } else if (currentVersion) {
                // 已知当前版本且无新版本：一律显示版本号；网络不可达时加 ⚠ 提示可点击重试
                label = 'v' + currentVersion + (failed ? ' ⚠' : '');
                color = failed ? '200,120,60' : '128,128,128';
              } else if (failed) {
                label = '检查失败 · 重试';
                color = '200,120,60';
              } else {
                label = updateBusy ? '检查中…' : '检查更新';
                color = '128,128,128';
              }
              return h('button', {
                onClick: function () {
                  if (hasUpdate) {
                    const url = info.latestUrl || 'https://github.com/windxxf/dsh-nvidia-models-panel/releases/latest';
                    window.open(url, '_blank', 'noopener,noreferrer');
                  } else if (!updateBusy) {
                    refreshUpdateCheck();
                  }
                },
                disabled: updateBusy && !hasUpdate,
                title: hasUpdate ? (info.message || '查看更新') : (currentVersion ? ('当前版本 v' + currentVersion + (failed ? '（检查更新失败，点击重试）' : '，点击重新检查')) : '检查更新'),
                style: {
                  padding: '3px 9px',
                  fontSize: '11px',
                  lineHeight: 1.4,
                  color: 'rgb(' + color + ')',
                  background: 'rgba(' + color + ',0.12)',
                  border: '1px solid rgba(' + color + ',0.35)',
                  borderRadius: '999px',
                  cursor: (hasUpdate || !updateBusy) ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  opacity: (updateBusy && !hasUpdate) ? 0.6 : 1,
                },
              }, label);
            })()
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            h('button', {
              onClick: function () { setHelpOpen(true); },
              'aria-label': '使用说明',
              title: '使用说明',
              style: {
                background: 'transparent',
                border: '1px solid rgba(128,128,128,0.4)',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                color: 'inherit',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.8,
                padding: 0,
              },
            }, '?'),
            h('button', {
              onClick: onClose,
              'aria-label': '关闭面板',
              style: {
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'inherit',
                display: 'flex',
                alignItems: 'center',
              },
            }, h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'currentColor', 'aria-hidden': 'true' },
              h('path', { d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' })))
          )
        ),
        h('div', {
          key: 'apikey',
          style: {
            padding: '12px',
            background: 'rgba(128,128,128,0.06)',
            border: '1px solid rgba(128,128,128,0.25)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', position: 'relative' } },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, 'NVIDIA API Key'),
            keyStatus ? (keyStatus.configured
              ? h('span', { style: { fontSize: '11px', color: '#2e7d32', border: '1px solid #2e7d32', borderRadius: '4px', padding: '1px 6px', background: 'rgba(46,125,50,0.10)' } },
                '已配置' + (keyStatus.source ? '（' + keyStatus.source + '）' : ''))
              : h('button', {
                  type: 'button',
                  onMouseEnter: function () { setKeyTipOpen(true); },
                  onMouseLeave: function () { setKeyTipOpen(false); },
                  onFocus: function () { setKeyTipOpen(true); },
                  onBlur: function () { setKeyTipOpen(false); },
                  onClick: function () { window.open(NVIDIA_KEY_URL, '_blank', 'noopener,noreferrer'); },
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    fontSize: '11px',
                    opacity: 0.85,
                    border: '1px dashed rgba(128,128,128,0.6)',
                    borderRadius: '4px',
                    padding: '1px 6px',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                  },
                },
                  '未配置',
                  h('span', {
                    style: {
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '13px', height: '13px', borderRadius: '50%',
                      border: '1px solid currentColor', fontSize: '9px', lineHeight: '1', fontWeight: 700,
                    },
                  }, '?')
                )) : null,
            keyStatus && keyStatus.unavailable ? h('span', { style: { fontSize: '11px', color: '#b8860b' } }, '（凭据服务不可用）') : null,
            // 自定义悬停浮层：原生 title 在 Tauri webview 里常不渲染，这里用 DOM 浮层显示注册步骤。
            keyTipOpen && keyStatus && !keyStatus.configured
              ? h('div', {
                  style: {
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                    width: '300px', maxWidth: 'calc(100vw - 48px)',
                    padding: '10px 12px', borderRadius: '6px',
                    background: 'var(--dsh-surface, #242529)',
                    border: '1px solid rgba(143,206,0,0.45)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                    color: 'inherit', fontSize: '11px', lineHeight: '1.7',
                    whiteSpace: 'pre-wrap', pointerEvents: 'none',
                  },
                }, NVIDIA_KEY_HINT)
              : null,
          ),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('input', {
              type: 'password',
              className: 'nm-key-input',
              ref: nmKeyInputRef,
              value: keyInput,
              onChange: function (e) { setKeyInput(e.target.value); },
              placeholder: '输入 nvapi-… Key（密文显示，不回显）',
              autoComplete: 'off',
              style: {
                flex: 1,
                minWidth: '200px',
                padding: '7px 12px',
                fontSize: '13px',
                border: '1px solid rgba(128,128,128,0.4)',
                borderRadius: '6px',
                background: 'transparent',
                color: 'inherit',
                boxSizing: 'border-box',
              },
            }),
            h('button', {
              onClick: saveKey,
              disabled: keyBusy || !keyInput.trim(),
              style: {
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 500,
                background: '#76B900',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: (keyBusy || !keyInput.trim()) ? 'wait' : 'pointer',
                opacity: (keyBusy || !keyInput.trim()) ? 0.6 : 1,
              },
            }, '保存 Key'),
            keyStatus && keyStatus.configured && keyStatus.writable ? h('button', {
              onClick: clearKey,
              disabled: keyBusy,
              style: {
                padding: '7px 14px',
                fontSize: '13px',
                background: 'transparent',
                border: '1px solid rgba(198,40,40,0.7)',
                color: '#c62828',
                borderRadius: '6px',
                cursor: keyBusy ? 'wait' : 'pointer',
              },
            }, '清除') : null,
          ),
          h('p', { style: { margin: 0, fontSize: '11px', opacity: 0.65, lineHeight: 1.5 } },
            'Key 保存在 Harness 凭据存储（与正式 nvidia 模型路由共用 NVIDIA_API_KEY 引用），不会写入配置文件或日志；保存后下一次请求立即生效。'),
          noKey ? h('p', { style: { margin: 0, fontSize: '12px', lineHeight: 1.5, color: '#b8860b' } },
            '⚠ 未配置 Key：检测、试调用与「模型组」都不可用，请先在上方保存 Key。') : null,
          keyMsg ? h('p', { style: { margin: 0, fontSize: '12px', lineHeight: 1.5 } }, keyMsg) : null,
        ),
        noKey ? noKeyWarning(keyHint) : null,
        tabBar,
        tab === 'models' ? h('div', {
          key: 'modelsPane',
          style: { display: 'flex', flexDirection: 'column', gap: '12px' },
        },
        [
        h('div', {
          key: 'actions',
          style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
        },
          h('button', {
            onClick: detectModels,
            disabled: detecting || verifying || noKey,
            title: noKey ? keyHint : undefined,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 500,
              background: '#76B900',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: (detecting || verifying || noKey) ? 'not-allowed' : 'pointer',
              opacity: (detecting || verifying || noKey) ? 0.6 : 1,
            },
          }, detecting ? '检测中…' : '检测可用模型'),
          h('button', {
            onClick: verifyAll,
            disabled: detecting || verifying || models.length === 0 || noKey,
            title: noKey ? keyHint : undefined,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 500,
              background: verifying ? 'rgba(118,185,0,0.4)' : '#3d8400',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: (detecting || verifying || models.length === 0 || noKey) ? 'not-allowed' : 'pointer',
              opacity: noKey ? 0.6 : 1,
            },
          }, verifying ? '试调用中…' : '逐个试调用'),
          verifying ? h('button', {
            onClick: stopVerify,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid rgba(198,40,40,0.7)',
              color: '#c62828',
              borderRadius: '6px',
              cursor: 'pointer',
            },
          }, '停止') : null,
          h('button', {
            onClick: configureModels,
            disabled: configuring || detecting || verifying || noKey,
            title: noKey ? keyHint : undefined,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid rgba(128,128,128,0.4)',
              borderRadius: '6px',
              cursor: (configuring || detecting || verifying || noKey) ? 'not-allowed' : 'pointer',
              opacity: (configuring || detecting || verifying || noKey) ? 0.6 : 1,
            },
          }, configuring ? '配置中…' : '一键配置到设置')
        ),
        message ? h('div', {
          key: 'message',
          style: {
            padding: '10px 12px',
            background: 'rgba(118,185,0,0.12)',
            border: '1px solid rgba(118,185,0,0.5)',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: 1.5,
          },
        }, message) : null,
        models.length > 0 ? h('div', {
          key: 'models',
          style: { display: 'flex', flexDirection: 'column', gap: '8px' },
        }, models.map(function (model) {
          const r = results[model.id];
          return h('div', {
            key: model.id,
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '10px 12px',
              background: 'rgba(128,128,128,0.06)',
              border: '1px solid rgba(128,128,128,0.25)',
              borderRadius: '6px',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } },
              h('span', { style: { fontWeight: 600, fontSize: '13px' } }, model.name),
              statusBadge(r),
              h('span', {
                style: { fontSize: '11px', opacity: 0.65, fontFamily: 'monospace' },
                title: model.id,
              }, model.id)
            ),
            h('p', { style: { margin: 0, fontSize: '12px', opacity: 0.85, lineHeight: 1.5 } }, model.description),
            r && r.detail && r.status !== 'ok' && r.status !== 'testing' ? h('p', {
              style: { margin: 0, fontSize: '11px', color: '#c62828', lineHeight: 1.4 },
            }, r.detail) : null
          );
        })) : h('div', {
          key: 'empty',
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            opacity: 0.55,
            gap: '8px',
            minHeight: '160px',
          },
        },
          h('svg', { viewBox: '0 0 24 24', width: 48, height: 48, fill: 'currentColor', 'aria-hidden': 'true' },
            h('path', { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' })),
          h('p', { style: { margin: 0, fontSize: '14px' } }, '尚未检测模型'),
          h('p', { style: { margin: 0, fontSize: '12px' } }, '点击「检测可用模型」获取列表，再点「逐个试调用」验证真实可用性')
        )
        ]) : (tab === 'usage' ? h('div', {
          key: 'usagePane',
          style: { display: 'flex', flexDirection: 'column', gap: '12px' },
        }, usageCard) : h('div', {
          key: 'groupPane',
          style: { display: 'flex', flexDirection: 'column', gap: '12px' },
        }, groupCard)),
        helpModal
      );
    }

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        const panelId = 'nvidia-models';

        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: panelId,
            order: 100,
            label: 'NVIDIA 模型',
          }, NvidiaPanelIcon);
        });

        ctx.slots.inject('main', function () {
          return ctx.slots.register({
            name: 'main',
            key: panelId,
          }, NvidiaModelsPanel);
        });

        // 对话输入框上方的 dock 徽标：order 10 位于待办(0)与队列(20)之间。
        ctx.slots.inject('conversation.input.dock', function () {
          return ctx.slots.register({
            name: 'conversation.input.dock',
            id: 'nvidia-group-status',
            order: 10,
            inject: function (sessionId) { return { sessionId: sessionId }; },
          }, DockBadge);
        });
      },
    };
  },
});
