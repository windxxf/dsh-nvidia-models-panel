window.__ModuleLoader__.load({
  id: 'dsh-nvidia-models-panel',
  factory(require) {
    const React = require('react');
    const { useState, useCallback, useRef, useEffect } = React;
    const h = React.createElement;

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

    function NvidiaModelsPanel(props) {
      const [models, setModels] = useState([]);
      const [detecting, setDetecting] = useState(false);
      const [verifying, setVerifying] = useState(false);
      const [message, setMessage] = useState('');
      const [results, setResults] = useState({});
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
        },
      },
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
            h('h2', { style: { margin: 0, fontSize: '16px', fontWeight: 600 } }, 'NVIDIA 模型')
          ),
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
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, 'NVIDIA API Key'),
            keyStatus ? (keyStatus.configured
              ? h('span', { style: { fontSize: '11px', color: '#2e7d32', border: '1px solid #2e7d32', borderRadius: '4px', padding: '1px 6px', background: 'rgba(46,125,50,0.10)' } },
                '已配置' + (keyStatus.source ? '（' + keyStatus.source + '）' : ''))
              : h('span', { style: { fontSize: '11px', opacity: 0.6, border: '1px dashed rgba(128,128,128,0.5)', borderRadius: '4px', padding: '1px 6px' } }, '未配置')) : null,
            keyStatus && keyStatus.unavailable ? h('span', { style: { fontSize: '11px', color: '#b8860b' } }, '（凭据服务不可用）') : null,
          ),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('input', {
              type: 'password',
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
          keyMsg ? h('p', { style: { margin: 0, fontSize: '12px', lineHeight: 1.5 } }, keyMsg) : null,
        ),
        h('div', {
          key: 'actions',
          style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
        },
          h('button', {
            onClick: detectModels,
            disabled: detecting || verifying,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 500,
              background: '#76B900',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: (detecting || verifying) ? 'wait' : 'pointer',
              opacity: (detecting || verifying) ? 0.6 : 1,
            },
          }, detecting ? '检测中…' : '检测可用模型'),
          h('button', {
            onClick: verifyAll,
            disabled: detecting || verifying || models.length === 0,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 500,
              background: verifying ? 'rgba(118,185,0,0.4)' : '#3d8400',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: (detecting || verifying || models.length === 0) ? 'wait' : 'pointer',
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
            disabled: configuring || detecting || verifying,
            style: {
              padding: '7px 14px',
              fontSize: '13px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid rgba(128,128,128,0.4)',
              borderRadius: '6px',
              cursor: (configuring || detecting || verifying) ? 'wait' : 'pointer',
              opacity: (configuring || detecting || verifying) ? 0.6 : 1,
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
      },
    };
  },
});
