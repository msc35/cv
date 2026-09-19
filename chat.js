/* "Ask AI-Selim" terminal widget. Talks to the Cloudflare Worker, which holds the key and the limits. */

// The deployed Cloudflare Worker. It holds the API key and enforces the limits.
const CHAT_API_URL = 'https://ai-selim.msc35.workers.dev/chat';
// Local preview (npx wrangler dev) talks to the local Worker instead.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

(() => {
    const SESSION_LIMIT = 5;
    const MAX_CHARS = 300;
    const MAX_HISTORY = 2; // previous Q/A pairs sent for follow-ups
    const EMAIL = 'mehmetselim692@gmail.com';

    const MESSAGES = {
        session_limit: `That's 5. Email me at ${EMAIL} for more.`,
        ip_limit: `That's the daily limit for your network. Email me at ${EMAIL} for more.`,
        global_limit: 'AI-Selim is resting. Email me instead.',
        disabled: 'AI-Selim is resting. Email me instead.',
        bad_request: `I can only take questions between 1 and ${MAX_CHARS} characters.`,
        upstream_error: `Something went wrong on my side. Try again in a moment, or email me at ${EMAIL}.`,
        network: `I couldn't reach the server. Check your connection and try again, or email me at ${EMAIL}.`,
    };
    const BLOCKING = new Set(['session_limit', 'ip_limit', 'global_limit', 'disabled']);

    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    const log = document.getElementById('chat-log');
    const count = document.getElementById('chat-count');
    const chars = document.getElementById('chat-chars');
    const chips = document.getElementById('chat-chips');
    const fab = document.getElementById('chat-fab');
    if (!form || !input || !log) return;

    // ---- Session state (sessionStorage, with an in-memory fallback) ----
    const store = {
        get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
        set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* private mode */ } },
    };
    const newId = () => (crypto.randomUUID ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));

    let sessionId = store.get('aiSelim.sessionId');
    if (!sessionId) { sessionId = newId(); store.set('aiSelim.sessionId', sessionId); }

    let remaining = Number(store.get('aiSelim.remaining') ?? SESSION_LIMIT);
    if (!Number.isFinite(remaining)) remaining = SESSION_LIMIT;
    let history = [];
    try { history = JSON.parse(store.get('aiSelim.history') || '[]'); } catch { history = []; }
    let busy = false;
    let blocked = store.get('aiSelim.blocked') === 'session_limit' ? 'session_limit' : null;

    // ---- Rendering ----
    const scrollLog = () => { log.scrollTop = log.scrollHeight; };

    // Plain text only; email addresses become mailto links. Never innerHTML.
    const addLine = (kind, text) => {
        const p = document.createElement('p');
        p.className = `line line-${kind}`;
        const parts = String(text).split(/([\w.+-]+@[\w-]+\.[\w.-]+)/g);
        parts.forEach((part, i) => {
            if (i % 2 === 1) {
                const a = document.createElement('a');
                a.href = `mailto:${part}`;
                a.textContent = part;
                p.append(a);
            } else if (part) {
                p.append(document.createTextNode(part));
            }
        });
        log.append(p);
        scrollLog();
        return p;
    };

    const showTyping = () => {
        const p = document.createElement('p');
        p.className = 'line line-ai';
        p.innerHTML = '<span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="send-fallback">AI-Selim is typing</span>';
        log.append(p);
        scrollLog();
        return p;
    };

    const render = () => {
        count.textContent = `Questions left: ${Math.max(0, remaining)}/${SESSION_LIMIT}`;
        const locked = busy || !!blocked;
        input.disabled = !!blocked;
        send.disabled = locked || input.value.trim().length === 0;
        chips.querySelectorAll('.chip').forEach((c) => { c.disabled = locked; });
        chips.hidden = !!blocked || history.length > 0;
        const n = input.value.length;
        chars.textContent = `${n}/${MAX_CHARS}`;
        chars.classList.toggle('near', n > MAX_CHARS - 30);
    };

    const block = (code) => {
        blocked = code;
        // Only a used-up session is permanent for this tab. A daily or global limit
        // can lift, so don't carry it over into the next page view.
        if (code === 'session_limit') store.set('aiSelim.blocked', code);
        input.placeholder = 'Chat closed. Email me instead.';
    };

    // ---- Request ----
    const ask = async (raw) => {
        const message = raw.trim().slice(0, MAX_CHARS);
        if (!message || busy || blocked) return;

        busy = true;
        input.value = '';
        render();
        addLine('user', message);
        const typing = showTyping();

        let code = null;
        try {
            const res = await fetch(IS_LOCAL ? 'http://localhost:8787/chat' : CHAT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, message, history: history.slice(-MAX_HISTORY) }),
            });
            let data = {};
            try { data = await res.json(); } catch { /* non-JSON error page */ }

            if (res.ok && typeof data.reply === 'string') {
                typing.remove();
                addLine('ai', data.reply);
                history = [...history, { q: message, a: data.reply }].slice(-MAX_HISTORY);
                store.set('aiSelim.history', JSON.stringify(history));
                if (Number.isFinite(data.sessionRemaining)) remaining = data.sessionRemaining;
                store.set('aiSelim.remaining', String(remaining));
                if (remaining <= 0) code = 'session_limit_after';
            } else {
                code = data.error in MESSAGES ? data.error : 'upstream_error';
                if (code === 'session_limit') { remaining = 0; store.set('aiSelim.remaining', '0'); }
            }
        } catch {
            code = 'network';
        }

        typing.remove();
        if (code === 'session_limit_after') {
            addLine('sys', MESSAGES.session_limit);
            block('session_limit');
        } else if (code) {
            addLine('err', MESSAGES[code]);
            if (BLOCKING.has(code)) block(code);
        }

        busy = false;
        render();
        if (!blocked) input.focus({ preventScroll: true });
    };

    // ---- Restore earlier Q/A from this tab session ----
    history.forEach(({ q, a }) => { addLine('user', q); addLine('ai', a); });
    if (blocked) addLine('err', MESSAGES[blocked] || MESSAGES.disabled);
    if (blocked) input.placeholder = 'Chat closed. Email me instead.';

    // ---- Events ----
    form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
    input.addEventListener('input', render);
    chips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (chip && !chip.disabled) ask(chip.textContent);
    });

    // Floating button: glide to the terminal and focus the input
    const focusInput = () => { if (!input.disabled) input.focus({ preventScroll: true }); };
    fab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // keep Lenis' anchor handler from replacing this scroll
        const target = document.getElementById('chat');
        if (window.siteLenis) {
            window.siteLenis.scrollTo(target, { offset: -72, onComplete: focusInput });
        } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(focusInput, 600);
        }
    });

    // Hide the button while the chat itself is on screen
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            fab.classList.toggle('is-hidden', entry.isIntersecting);
            if (entry.isIntersecting) fab.setAttribute('tabindex', '-1'); else fab.removeAttribute('tabindex');
        }, { threshold: 0.25 }).observe(document.getElementById('chat'));
    }

    render();
})();
