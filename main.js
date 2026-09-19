/* Scroll story: GSAP + ScrollTrigger + SplitText, smoothed by Lenis on GSAP's ticker.
   Everything is visible without this file; it only adds motion. */
(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stopMotion = () => root.classList.remove('anim', 'prehide');

    if (reduced || !window.gsap || !window.ScrollTrigger) {
        stopMotion();
        return;
    }

    const { gsap, ScrollTrigger } = window;
    const hasSplit = !!window.SplitText;
    gsap.registerPlugin(ScrollTrigger);
    if (hasSplit) gsap.registerPlugin(window.SplitText);

    // ---- One loop: Lenis driven by GSAP's ticker ----
    if (window.Lenis) {
        const lenis = new window.Lenis({ autoRaf: false, anchors: { offset: -72 } });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
        window.siteLenis = lenis;
    }

    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => gsap.utils.toArray(sel);
    const ease = 'power3.out';

    const reveal = (targets, vars = {}) =>
        gsap.fromTo(targets,
            { opacity: 0, y: vars.y ?? 32 },
            {
                opacity: 1, y: 0, duration: vars.duration ?? 0.9, ease, stagger: vars.stagger ?? 0,
                scrollTrigger: { trigger: vars.trigger ?? targets, start: vars.start ?? 'top 86%', once: true },
            });

    // Staggered batches for grids (cards, pills)
    const batchReveal = (selector, y = 40, stagger = 0.08) => {
        const items = qa(selector);
        if (!items.length) return;
        gsap.set(items, { opacity: 0, y });
        ScrollTrigger.batch(items, {
            start: 'top 90%',
            once: true,
            onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease, stagger, overwrite: true }),
        });
    };

    const mm = gsap.matchMedia();

    mm.add({ desktop: '(min-width: 768px)', mobile: '(max-width: 767px)' }, (ctx) => {
        const { desktop } = ctx.conditions;

        // ---- Section headers and single blocks ----
        qa('[data-reveal]').forEach((el) => reveal(el));

        // ---- 1. Hero (pinned on desktop) ----
        if (desktop) {
            const stage = q('.hero-stage');
            const name = q('.hero-name');
            const role = q('.hero-role');
            const detail = q('.hero-detail');
            const cue = q('.scroll-cue');
            const gap = () => parseFloat(getComputedStyle(stage).rowGap) || 0;
            // Start with name + role centred as if the details weren't there
            const lift = () => (detail.offsetHeight + gap()) / 2;
            const SCALE = 0.62;

            gsap.timeline({
                scrollTrigger: {
                    trigger: '.hero', start: 'top top', end: '+=90%',
                    scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
                },
            })
                .fromTo(name, { y: lift, scale: 1 }, { y: 0, scale: SCALE, ease: 'none' }, 0)
                // Role follows the shrinking top edge of the name
                .fromTo(role, { y: lift }, { y: () => name.offsetHeight * (1 - SCALE), ease: 'none' }, 0)
                .fromTo(detail, { opacity: 0, y: 60 }, { opacity: 1, y: 0, ease: 'none', duration: 0.6 }, 0.35)
                .to(cue, { opacity: 0, duration: 0.2, ease: 'none' }, 0);
        }

        // ---- 2. About: line-by-line ----
        const about = q('[data-split]');
        if (about && hasSplit && desktop) {
            window.SplitText.create(about, {
                type: 'lines',
                mask: 'lines',
                aria: 'none', // text stays in the DOM as-is; no aria-label on a <p>
                linesClass: 'split-line',
                autoSplit: true,
                onSplit: (self) => gsap.from(self.lines, {
                    yPercent: 110, opacity: 0, duration: 1, ease, stagger: 0.09,
                    scrollTrigger: { trigger: about, start: 'top 80%', once: true },
                }),
            });
        } else if (about) {
            reveal(about);
        }
        batchReveal('[data-stagger] > *', 16, 0.04);

        // ---- 3. Guidera spotlight (pinned on desktop) ----
        const copyItems = qa('.spotlight-copy > *');
        const phone = q('.phone-wrap');
        if (desktop) {
            gsap.timeline({
                scrollTrigger: {
                    trigger: '.spotlight', start: 'top top', end: '+=100%',
                    scrub: 0.6, pin: true, anticipatePin: 1,
                },
            })
                .fromTo(phone, { opacity: 0, x: 220, rotate: 8 }, { opacity: 1, x: 0, rotate: 0, ease: 'power2.out', duration: 1 }, 0)
                .fromTo(copyItems, { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: 0.12, ease: 'power2.out', duration: 0.6 }, 0.1)
                .to({}, { duration: 0.4 }); // short hold before unpinning
        } else {
            reveal(copyItems, { trigger: '.spotlight', stagger: 0.08, y: 24 });
            reveal(phone, { y: 40 });
        }

        // ---- 4. Cards: projects, education, skills, certs, languages ----
        batchReveal('[data-cards] > *', desktop ? 48 : 24, desktop ? 0.08 : 0.05);

        // ---- 5. Experience timeline ----
        const line = q('.timeline-line');
        if (desktop) {
            gsap.fromTo(line, { scaleY: 0 }, {
                scaleY: 1, ease: 'none',
                scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 60%', scrub: 0.5 },
            });
        }
        qa('.exp-item').forEach((item) => {
            gsap.fromTo(item, { opacity: 0, x: desktop ? 40 : 0, y: desktop ? 0 : 24 }, {
                opacity: 1, x: 0, y: 0, duration: 0.9, ease,
                scrollTrigger: { trigger: item, start: 'top 82%', once: true },
            });
        });
    });

    // Start states are now set inline by GSAP, so the CSS pre-hide can go.
    // (If a media query later flips, reverted elements fall back to visible.)
    root.classList.remove('prehide');

    // Pins depend on final font metrics and image sizes.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh());
})();
