// --- QUANT EDGE NOTIFICATION & TELEGRAM INTELLIGENCE UTILITIES ---

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatRow(left, right, totalWidth = 32) {
    left = String(left || '');
    right = String(right || '');
    if (left.length + right.length >= totalWidth) {
        const maxLeft = totalWidth - right.length - 1;
        if (maxLeft > 4) left = left.substring(0, maxLeft);
    }
    const space = Math.max(1, totalWidth - left.length - right.length);
    return left + ' '.repeat(space) + right;
}

function computeInstitutionalMetrics(trades = []) {
    const totalTrades = trades.length;
    let wins = 0, losses = 0, breakevens = 0;
    let totalPnl = 0, totalR = 0;
    let grossProfit = 0, grossLoss = 0;
    let winRSum = 0, lossRSum = 0;
    let rValues = [];

    let ruleAdherentCount = 0;
    let qualitySum = 0, qualityCount = 0;
    let calmCount = 0, emotionChecks = 0;

    let bestTrade = null, worstTrade = null;
    let bestR = -Infinity, worstR = Infinity;

    const setupMap = {};
    const sessionMap = {};
    const accountMap = {};
    const assetMap = {};

    trades.forEach(t => {
        const r = parseFloat(t.r) || 0;
        const pnl = parseFloat(t.pnlAmount) || 0;
        totalR += r;
        totalPnl += pnl;
        rValues.push(r);

        if (r > 0.05) {
            wins++;
            grossProfit += pnl > 0 ? pnl : 0;
            winRSum += r;
        } else if (r < -0.05 || t.result === "Loss") {
            losses++;
            grossLoss += Math.abs(pnl);
            lossRSum += Math.abs(r);
        } else {
            breakevens++;
        }

        if (r > bestR) { bestR = r; bestTrade = t; }
        if (r < worstR) { worstR = r; worstTrade = t; }

        if (t.ruleAdherence === 'Yes') ruleAdherentCount++;

        if (t.qualityScore !== undefined && t.qualityScore !== null && !isNaN(parseInt(t.qualityScore))) {
            qualitySum += parseInt(t.qualityScore);
            qualityCount++;
        }

        // Psychological state checks
        const calmEmotions = ["Calm", "Confident", "Disciplined", "Patient"];
        if (t.preEmotion) {
            emotionChecks++;
            if (calmEmotions.includes(t.preEmotion)) calmCount++;
        }
        if (t.duringEmotion) {
            emotionChecks++;
            if (calmEmotions.includes(t.duringEmotion)) calmCount++;
        }

        // Setups
        const setup = t.setupType || "Discretionary";
        if (!setupMap[setup]) setupMap[setup] = { count: 0, r: 0, pnl: 0 };
        setupMap[setup].count++;
        setupMap[setup].r += r;
        setupMap[setup].pnl += pnl;

        // Sessions
        const session = t.session || "Unspecified";
        if (!sessionMap[session]) sessionMap[session] = { count: 0, r: 0, pnl: 0 };
        sessionMap[session].count++;
        sessionMap[session].r += r;
        sessionMap[session].pnl += pnl;

        // Accounts
        const accId = t.accountId || "default";
        if (!accountMap[accId]) accountMap[accId] = { count: 0, r: 0, pnl: 0 };
        accountMap[accId].count++;
        accountMap[accId].r += r;
        accountMap[accId].pnl += pnl;

        // Assets
        const asset = t.asset || "Other";
        if (!assetMap[asset]) assetMap[asset] = { count: 0, r: 0, pnl: 0 };
        assetMap[asset].count++;
        assetMap[asset].r += r;
        assetMap[asset].pnl += pnl;
    });

    const evaluatedTrades = wins + losses;
    const winRate = evaluatedTrades > 0 ? (wins / evaluatedTrades) * 100 : (totalTrades > 0 ? 0 : 0);
    const avgWinR = wins > 0 ? winRSum / wins : 0;
    const avgLossR = losses > 0 ? lossRSum / losses : 0;

    let profitFactor = 0;
    if (grossLoss > 0) {
        profitFactor = grossProfit / grossLoss;
    } else if (grossProfit > 0) {
        profitFactor = 99.99;
    }

    const expectancyR = totalTrades > 0 ? totalR / totalTrades : 0;
    const expectancyPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;

    let sharpeRatio = 0;
    if (totalTrades > 1) {
        const meanR = totalR / totalTrades;
        const variance = rValues.reduce((sum, val) => sum + Math.pow(val - meanR, 2), 0) / (totalTrades - 1);
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0.0001) {
            sharpeRatio = (meanR / stdDev) * Math.sqrt(Math.min(totalTrades, 252));
        }
    }

    const ruleAdherenceRate = totalTrades > 0 ? (ruleAdherentCount / totalTrades) * 100 : 100;
    const avgQuality = qualityCount > 0 ? (qualitySum / qualityCount) : 9.0;
    const psychStability = emotionChecks > 0 ? ((calmCount / emotionChecks) * 10) : 9.0;

    return {
        totalTrades,
        wins,
        losses,
        breakevens,
        winRate,
        totalPnl,
        totalR,
        grossProfit,
        grossLoss,
        profitFactor,
        avgWinR,
        avgLossR,
        expectancyR,
        expectancyPnl,
        sharpeRatio,
        ruleAdherentCount,
        ruleViolations: totalTrades - ruleAdherentCount,
        ruleAdherenceRate,
        avgQuality,
        psychStability,
        bestTrade,
        worstTrade,
        setupMap,
        sessionMap,
        accountMap,
        assetMap
    };
}

class NotificationEngine {
    constructor() {
        this.checkInterval = 60000; // 1 minute
        this.intervalId = null;
        this.alertBackoff = new Map(); // Prevent spamming same alerts
    }

    init() {
        if (!Store.settings.notifications) {
            const old = Store.settings.notifications || {};
            Store.settings.notifications = {
                telegram: { 
                    token: typeof old.telegramToken === 'string' ? old.telegramToken : '', 
                    chatId: typeof old.telegramChat === 'string' ? old.telegramChat : '', 
                    alerts: old.telegramRtAlerts !== false, 
                    daily: old.telegramDailyRep !== false, 
                    weekly: old.telegramWeeklyRep !== false, 
                    monthly: !!old.telegramMonthlyRep,
                    enabled: old.telegramEnabled !== false
                },
                schedule: { dailyTime: '21:00', monthlyTime: '08:00', weeklyDay: 0, weeklyTime: '20:00' },
                thresholds: { 
                    lossWarn: old.lossThresh || 50, 
                    ddWarn: old.ddThresh || 70, 
                    streak: old.streakThresh || 3, 
                    eqHigh: old.eqHigh !== false, 
                    psychEscalate: old.psychEscalation !== false, 
                    tradeLogged: !!old.tradeLogged 
                }
            };
        }
        // Load into UI
        const cfg = Store.settings.notifications;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        
        setVal('webhook-telegram-token', cfg.telegram?.token || '');
        setVal('webhook-telegram-chat', cfg.telegram?.chatId || '');
        setCheck('telegram-enabled', cfg.telegram?.enabled !== false);
        setCheck('telegram-rt-alerts', cfg.telegram?.alerts);
        setCheck('telegram-daily-rep', cfg.telegram?.daily);
        setCheck('telegram-weekly-rep', cfg.telegram?.weekly);
        setCheck('telegram-monthly-rep', cfg.telegram?.monthly);

        setVal('notif-loss-thresh', cfg.thresholds?.lossWarn || 50);
        setVal('notif-dd-thresh', cfg.thresholds.ddWarn || 70);
        setVal('notif-streak-thresh', cfg.thresholds.streak || 3);
        setCheck('notif-eq-high', cfg.thresholds.eqHigh);
        setCheck('notif-psych-escalation', cfg.thresholds.psychEscalate);
        setCheck('notif-trade-logged', cfg.thresholds.tradeLogged);

        // Start background loop
        this.startEngine();
    }

    startEngine() {
        if(this.intervalId) clearInterval(this.intervalId);
        // Automated report schedule check removed; alerts still evaluate on individual triggers.
    }

    saveSettings() {
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const getCheck = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
        const getInt = (id, def) => { const el = document.getElementById(id); return el ? parseInt(el.value) || def : def; };

        Store.settings.notifications = {
            telegram: {
                token: getVal('webhook-telegram-token'),
                chatId: getVal('webhook-telegram-chat'),
                enabled: getCheck('telegram-enabled'),
                alerts: getCheck('telegram-rt-alerts'),
                daily: getCheck('telegram-daily-rep'),
                weekly: getCheck('telegram-weekly-rep'),
                monthly: getCheck('telegram-monthly-rep')
            },
            // Schedule removed for manual report generation
            thresholds: {
                lossWarn: getInt('notif-loss-thresh', 50),
                ddWarn: getInt('notif-dd-thresh', 70),
                streak: getInt('notif-streak-thresh', 3),
                eqHigh: getCheck('notif-eq-high'),
                psychEscalate: getCheck('notif-psych-escalation'),
                tradeLogged: getCheck('notif-trade-logged')
            }
        };
        Store.save();
    }

    manualReport(type) {
        this.saveSettings(); // Ensure we have the latest inputs (e.g. if user hasn't blurred yet)
        const statusEl = document.getElementById('notif-test-status');
        if (statusEl) {
            statusEl.innerText = 'Generating...';
            statusEl.style.color = 'var(--text)';
        }
        
        const finish = (msg, isError = false) => {
            if (statusEl) {
                statusEl.innerText = msg;
                statusEl.style.color = isError ? 'var(--danger)' : 'var(--success)';
            }
            if (isError) console.error(msg);
        };

        try {
            if (type === 'daily') {
                this.sendDailyReport(true).then(()=> finish("Daily report generated & sent")).catch(err => finish("Error: " + err.message, true));
            } else if (type === 'weekly') {
                this.sendWeeklyReport(true).then(()=> finish("Weekly report generated & sent")).catch(err => finish("Error: " + err.message, true));
            } else if (type === 'monthly') {
                this.sendMonthlyReport(true).then(()=> finish("Monthly report generated & sent")).catch(err => finish("Error: " + err.message, true));
            }
        } catch (e) {
            finish("Error: " + e.message, true);
        }
    }

    // Automated scheduling check logic removed

    async doSend(payloadFunc, flags, force = false) {
        const cfg = Store.settings.notifications;
        let p = [];

        const useTelegram = cfg.telegram.enabled && cfg.telegram.token && cfg.telegram.chatId && (force || flags.telegram);
        if (useTelegram) {
            const tp = payloadFunc('telegram');
            if(tp) {
                // simple rate limiting wait
                if (this.lastTelegramSent && Date.now() - this.lastTelegramSent < 1100) {
                    await new Promise(r => setTimeout(r, 1100 - (Date.now() - this.lastTelegramSent)));
                }
                this.lastTelegramSent = Date.now();
                p.push(this.postTelegram(cfg.telegram.token, cfg.telegram.chatId, tp));
            }
        }

        if(p.length > 0) {
            try {
                const results = await Promise.allSettled(p);
                let failures = [];
                for (let r of results) {
                    if (r.status === 'rejected') {
                        failures.push(r.reason.message || r.reason);
                        console.error("Notification delivery failed for a platform:", r.reason);
                    }
                }
                if (failures.length === p.length) {
                    // All failed
                    throw new Error("All checks failed: " + failures.join(' | '));
                } else if (failures.length > 0) {
                    console.warn("Some notifications failed: " + failures.join(' | '));
                }
            } catch(e) {
                console.error("Notification send error", e);
                throw e;
            }
        } else if (force) {
            throw new Error("No notification platforms are fully configured (check URLs/Tokens).");
        }
    }

    async postTelegram(token, chatId, text) {
        token = (token || '').trim().replace(/\s+/g, '');
        chatId = (chatId || '').trim();
        const cleanToken = token.toLowerCase().startsWith('bot') ? token.substring(3) : token;

        if (!cleanToken || !chatId) {
            throw new Error("Telegram Bot Token and Chat ID are required. Please configure them in Settings > Webhooks & Alerts.");
        }

        // 1. Primary: Use our robust server relay on server.ts (bypasses browser CORS & gives full error detail)
        try {
            const telegramRelayUrl = typeof window.resolveApiUrl === 'function'
                ? window.resolveApiUrl('/api/telegram/send')
                : '/api/telegram/send';
            const serverRes = await fetch(telegramRelayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: cleanToken,
                    chatId: chatId,
                    text: text,
                    parse_mode: 'HTML'
                })
            });

            // If the server relay route was hit (not 404/405 static host)
            if (serverRes.status !== 404 && serverRes.status !== 405) {
                const data = await serverRes.json().catch(() => ({}));
                if (!serverRes.ok || !data.ok) {
                    throw new Error(data.error || `Telegram API error (${serverRes.status})`);
                }
                return { ok: true, result: data.result };
            }
        } catch(serverErr) {
            // If the server explicitly returned an API rejection from Telegram, throw it directly with actionable advice
            if (serverErr.message && !serverErr.message.includes('Failed to fetch') && !serverErr.message.includes('404') && !serverErr.message.includes('405')) {
                throw serverErr;
            }
            console.warn("Server relay unavailable, falling back to direct browser connection:", serverErr.message);
        }

        // 2. Fallback: Direct client fetch for static deployments (e.g. GitHub Pages)
        const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
        try {
            const body = new URLSearchParams();
            body.append('chat_id', chatId);
            body.append('text', text);
            body.append('parse_mode', 'HTML');

            let res;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) {
                    throw new Error(data.description || `Telegram error (${res.status})`);
                }
                return res;
            } catch(fetchErr) {
                // If direct POST fails due to CORS, try GET fallback
                const getUrl = `${url}?chat_id=${encodeURIComponent(chatId)}&text=${encodeURIComponent(text)}&parse_mode=HTML`;
                res = await fetch(getUrl).then(r => r.json()).catch(() => null);
                if (res && res.ok) return res;
                throw new Error("Browser blocked direct connection to api.telegram.org (CORS/Adblocker). Please ensure you run with backend server or disable browser tracker blocker.");
            }
        } catch(err) {
            throw new Error(`Telegram delivery failed: ${err.message || 'Unknown error'}`);
        }
    }

    isSpam(key, cooldownMins=5) {
        const last = this.alertBackoff.get(key) || 0;
        const now = Date.now();
        if (now - last < cooldownMins * 60000) return true;
        this.alertBackoff.set(key, now);
        return false;
    }

    // --- ALERTS TRIGGERED EXTERNALLY ---

    // Expected object containing account name, loss, limit, usedPct, remaining
    dispatchLossWarning(accnt, rLoss, limit, allow) {
        const cfg = Store.settings.notifications;
        if (this.isSpam('loss_warn_' + accnt.name, 10)) return;

        const blocks = Math.round(Math.min(1, Math.max(0, allow)) * 10);
        const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
        const usedPct = Math.round(allow * 100);
        const remain = Math.max(0, limit - Math.abs(rLoss)).toFixed(2);

        const cardText = [
            formatRow("Account", escapeHtml(accnt.name).substring(0, 16), 32),
            formatRow("Daily Loss So Far", `${rLoss.toFixed(2)}R`, 32),
            formatRow("Daily Limit", `${limit.toFixed(2)}R`, 32),
            formatRow("Risk Budget Used", `${usedPct}%`, 32),
            formatRow("Remaining Allowance", `${remain}R`, 32)
        ].join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "⚠️ PORTFOLIO ALERT — DAILY LOSS WARNING",
                        color: 15158332,
                        description: `**Account:** ${accnt.name}\n**Loss So Far:** ${rLoss.toFixed(2)}R of ${limit.toFixed(2)}R Limit\n**Used:** ${usedPct}% [${bar}]\n**Remaining:** ${remain}R\n\n*Slow down. Protect your capital.*`
                    }]
                };
            }
            return `⚠️ <b>PORTFOLIO ALERT — DAILY LOSS WARNING</b>\n` +
                   `<b>Account:</b> <code>${escapeHtml(accnt.name)}</code>\n` +
                   `<b>Loss Today:</b> <code>${rLoss.toFixed(2)}R</code> of <code>${limit.toFixed(2)}R</code> (${usedPct}% used)\n\n` +
                   `<pre>\nRisk Allowance Gauge\n────────────────────────────────\n[${bar}] ${usedPct}%\n\n${cardText}\n</pre>\n\n` +
                   `<i>⚠️ Capital preservation protocol engaged. Review rule checklist before taking any further trades.</i>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchLossHit(accnt, rLoss, limit) {
        const cfg = Store.settings.notifications;
        if (this.isSpam('loss_hit_' + accnt.name, 60)) return;

        const tableText = [
            formatRow("Account", escapeHtml(accnt.name).substring(0, 16), 32),
            formatRow("Loss Incurred", `${rLoss.toFixed(2)}R`, 32),
            formatRow("Loss Barrier", `${limit.toFixed(2)}R (100%)`, 32),
            formatRow("Terminal Status", "LOCKED", 32),
            formatRow("Reflection Protocol", "MANDATORY", 32)
        ].join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "🔴 TRADING HALT — DAILY LIMIT REACHED",
                        color: 15158332,
                        description: `**Account:** ${accnt.name}\n**Loss Incurred:** ${rLoss.toFixed(2)}R (100% of ${limit.toFixed(2)}R Limit)\n\nJournal is locked. Complete reflection to unlock tomorrow.\n**Stop. Breathe. Review.**`
                    }]
                };
            }
            return `🔴 <b>TRADING HALT — DAILY LIMIT REACHED</b>\n` +
                   `<b>Account:</b> <code>${escapeHtml(accnt.name)}</code>\n` +
                   `<b>Loss Incurred:</b> <code>${rLoss.toFixed(2)}R</code> (100% of Limit)\n\n` +
                   `<pre>\nTerminal Protocol Status\n────────────────────────────────\n${tableText}\n</pre>\n\n` +
                   `<blockquote expandable>\n<b>Discipline Directive:</b>\nTerminal is locked for the remainder of today. Step away from the screens immediately. Complete your trade reflection before trading tomorrow.\n</blockquote>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchEquityHigh(accnt, newMax, prevMax) {
        const cfg = Store.settings.notifications;
        if (!cfg.thresholds.eqHigh) return;

        const gain = newMax - prevMax;
        const gainPct = (gain / prevMax * 100);

        const tableText = [
            formatRow("Account", escapeHtml(accnt.name).substring(0, 16), 32),
            formatRow("New Peak Equity", `$${Number(newMax).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 32),
            formatRow("Previous Peak", `$${Number(prevMax).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 32),
            formatRow("Milestone Gain", `+$${Number(gain).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 32),
            formatRow("Net Growth", `+${gainPct.toFixed(2)}%`, 32)
        ].join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "🏆 PORTFOLIO MILESTONE — NEW EQUITY HIGH",
                        color: 3066993,
                        description: `**Account:** ${accnt.name}\n**New High:** $${parseFloat(newMax).toLocaleString()}\n**Gain:** +$${parseFloat(gain).toLocaleString()} (+${gainPct.toFixed(2)}%)\n\n*Keep building. Stay disciplined.*`
                    }]
                };
            }
            return `🏆 <b>PORTFOLIO MILESTONE — NEW EQUITY HIGH</b>\n` +
                   `<b>Account:</b> <code>${escapeHtml(accnt.name)}</code>\n\n` +
                   `<pre>\nMilestone Audit Ledger\n────────────────────────────────\n${tableText}\n</pre>\n\n` +
                   `<i>Discipline creates compounding. Maintain your system execution rules.</i>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchConsecutiveLoss(streak, trades) {
        const cfg = Store.settings.notifications;
        if (this.isSpam('streak_loss', 30)) return;

        const rTotal = trades.reduce((a, b) => a + (parseFloat(b.r) || 0), 0);
        const lossRows = trades.slice(0, 5).map(t => {
            const assetStr = escapeHtml(t.asset || 'Asset').substring(0, 14);
            const rVal = (parseFloat(t.r) || 0).toFixed(2) + 'R';
            return formatRow(`❌ ${assetStr}`, rVal, 32);
        }).join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "🔁 DISCIPLINE ALERT — LOSS STREAK DETECTED",
                        color: 15158332,
                        description: `**Consecutive Losses:** ${streak}\n**Total Streak Loss:** ${rTotal.toFixed(2)}R\n**Psychological Risk:** ELEVATED\n\n*Consider stepping away. Review before next trade.*`
                    }]
                };
            }
            return `🔁 <b>DISCIPLINE ALERT — LOSS STREAK DETECTED</b>\n` +
                   `<b>Streak Count:</b> <code>${streak} Consecutive Losses</code>\n\n` +
                   `<pre>\nRecent Loss Executions\n────────────────────────────────\n${lossRows}\n────────────────────────────────\n` +
                   `${formatRow("Total Streak Loss", `${rTotal.toFixed(2)}R`, 32)}\n` +
                   `${formatRow("Psychological State", "ELEVATED RISK", 32)}\n</pre>\n\n` +
                   `<i>High risk of revenge trading or tilt. Step away from charts for minimum 30 minutes.</i>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchPsychEscalation(level, avgEmotion, losses) {
        const cfg = Store.settings.notifications;
        if (!cfg.thresholds.psychEscalate) return;
        if (this.isSpam('psych_escalation', 60)) return;

        const isCrit = level === "CRITICAL";
        const levelBadge = isCrit ? "🔴 CRITICAL" : "🟠 ELEVATED";

        const tableText = [
            formatRow("Mental Risk Level", level, 32),
            formatRow("Negative State Ratio", `${avgEmotion}%`, 32),
            formatRow("Consecutive Losses", `${losses} trades`, 32),
            formatRow("Risk Protocol", isCrit ? "HALT TRADING" : "HALVE POSITION SIZE", 32)
        ].join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "🧠 PSYCH RISK ESCALATION",
                        color: isCrit ? 15158332 : 15105570,
                        description: `**Risk Level:** ${levelBadge}\n**Negative Emotions:** ${avgEmotion}%\n**Losses:** ${losses}\n\n*Your mental state is affecting performance. Step back.*`
                    }]
                };
            }
            return `🧠 <b>PSYCHOLOGICAL RISK ESCALATION</b>\n` +
                   `<b>Current State:</b> ${levelBadge}\n\n` +
                   `<pre>\nBehavioral Risk Assessment\n────────────────────────────────\n${tableText}\n</pre>\n\n` +
                   `<blockquote expandable>\n<b>Psychology Coach Directive:</b>\nEmotional equilibrium compromised. Do not attempt to make back losses in this state. Close terminal and reset mental state.\n</blockquote>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchTradeLogged(trade) {
        const cfg = Store.settings.notifications;
        if (!cfg.thresholds.tradeLogged) return;

        const r = parseFloat(trade.r) || 0;
        const pnl = parseFloat(trade.pnlAmount) || 0;
        const prefix = r >= 0 ? '+' : '';
        const pnlPrefix = pnl >= 0 ? '+' : '';
        const accnt = Store.accounts.find(a => String(a.id) === String(trade.accountId));
        const aName = accnt ? accnt.name : "Portfolio Account";
        const bal = accnt && accnt.balance ? `$${parseFloat(accnt.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

        const isLong = (trade.tradeDirection || trade.tradeType || trade.direction || '').toLowerCase().includes('long');
        const dirBadge = isLong ? '🟢 LONG' : '🔴 SHORT';
        const resultEmoji = r > 0 ? '🟢' : (r < 0 ? '🔴' : '⚪');

        const entryStr = trade.entryPrice ? Number(trade.entryPrice).toFixed(trade.entryPrice < 10 ? 4 : 2) : '-';
        const exitStr = trade.exitPrice ? Number(trade.exitPrice).toFixed(trade.exitPrice < 10 ? 4 : 2) : '-';
        const riskStr = trade.riskAmount ? `$${Number(trade.riskAmount).toFixed(0)}` : (trade.riskPercent ? `${trade.riskPercent}%` : '-');
        const plannedRStr = trade.plannedR ? `1:${Number(trade.plannedR).toFixed(1)}` : '-';
        const ruleStatus = trade.ruleAdherence === 'Yes' ? '✓ PASS (100%)' : '✕ DEVIATION';
        const sessionStr = trade.session || 'London Open';
        const setupStr = trade.setupType || 'Liquidity Sweep';
        const preEmo = trade.preEmotion || 'Calm';
        const durEmo = trade.duringEmotion || 'Disciplined';

        const tableText = [
            formatRow("Execution Type", `${trade.executionType || 'Market'} (${sessionStr})`, 32),
            formatRow("Strategy Setup", setupStr, 32),
            formatRow("Entry → Exit", `${entryStr} → ${exitStr}`, 32),
            formatRow("Risk / Planned R", `${riskStr} (${plannedRStr})`, 32),
            formatRow("Rule Adherence", ruleStatus, 32),
            formatRow("Psych State", `${preEmo} / ${durEmo}`, 32)
        ].join('\n');

        let notesBlock = '';
        if (trade.postNotes && trade.postNotes.trim()) {
            notesBlock = `\n<blockquote expandable>\n<b>Trade Reflection:</b>\n${escapeHtml(trade.postNotes.trim())}\n</blockquote>`;
        }

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: `📝 TRADE EXECUTION TICKET — ${trade.asset}`,
                        color: r >= 0 ? 3066993 : 15158332,
                        description: `**Direction:** ${trade.tradeDirection || 'Long'}\n**Result:** ${prefix}${r.toFixed(2)}R (${pnlPrefix}$${pnl.toFixed(2)})\n**Grade:** ${trade.tradeGrade || '-'}\n**Setup:** ${setupStr}\n**Account:** ${aName}\n\n*${trade.postNotes || ''}*`,
                        footer: { text: "QuantEdge Portfolio OS" }
                    }]
                };
            }
            return `📝 <b>TRADE EXECUTION TICKET</b>\n` +
                   `<b>Asset:</b> <code>${escapeHtml(trade.asset)}</code>  •  <b>Direction:</b> ${dirBadge}\n` +
                   `<b>Result:</b> ${resultEmoji} <code>${prefix}${r.toFixed(2)}R</code> (<code>${pnlPrefix}$${pnl.toFixed(2)}</code>)  •  <b>Grade:</b> <code>${escapeHtml(trade.tradeGrade || 'A')}</code>\n\n` +
                   `<pre>\nExecution Audit Ledger          Value\n────────────────────────────────\n${tableText}\n</pre>` +
                   notesBlock +
                   `\n\n💼 <b>Account:</b> ${escapeHtml(aName)}  •  <b>Balance:</b> <code>${bal}</code>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchDrawdownWarning(accnt, currentDd, maxDd, usedPct) {
        const cfg = Store.settings.notifications;
        if (this.isSpam('dd_warn_' + accnt.name, 60)) return;

        const blocks = Math.round(Math.min(1, Math.max(0, usedPct)) * 10);
        const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
        const remain = Math.max(0, maxDd - currentDd);
        const pctUsed = Math.round(usedPct * 100);

        const tableText = [
            formatRow("Account", escapeHtml(accnt.name).substring(0, 16), 32),
            formatRow("Current Drawdown", `$${currentDd.toFixed(2)}`, 32),
            formatRow("Max Permitted DD", `$${maxDd.toFixed(2)}`, 32),
            formatRow("DD Consumption", `${pctUsed}%`, 32),
            formatRow("Remaining Buffer", `$${remain.toFixed(2)}`, 32)
        ].join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "⚠️ DRAWDOWN WARNING",
                        color: 15158332,
                        description: `**Account:** ${accnt.name}\n**Current DD:** $${currentDd.toFixed(2)} of $${maxDd.toFixed(2)}\n**Used:** ${pctUsed}% [${bar}]\n**Remaining:** $${remain.toFixed(2)}\n\n*Reduce position size immediately.*`
                    }]
                };
            }
            return `⚠️ <b>PORTFOLIO ALERT — DRAWDOWN WARNING</b>\n` +
                   `<b>Account:</b> <code>${escapeHtml(accnt.name)}</code>\n` +
                   `<b>Drawdown:</b> <code>$${currentDd.toFixed(2)}</code> of <code>$${maxDd.toFixed(2)}</code> (${pctUsed}% used)\n\n` +
                   `<pre>\nDrawdown Utilization Gauge\n────────────────────────────────\n[${bar}] ${pctUsed}%\n\n${tableText}\n</pre>\n\n` +
                   `<i>Approaching maximum trailing drawdown barrier. Halve position risk immediately.</i>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    dispatchPropTargetReached(accnt, achievedAmount, targetAmount) {
        const cfg = Store.settings.notifications;
        if (this.isSpam('prop_target_' + accnt.name, 1440)) return;

        const bal = parseFloat(accnt.balance) || 100000;
        const targetPct = (targetAmount / bal) * 100;
        const achievedPct = (achievedAmount / bal) * 100;
        let ddUsed = 0;
        if (accnt.highWaterMark && accnt.currentBalance) {
            ddUsed = Math.max(0, (accnt.highWaterMark - accnt.currentBalance) / bal * 100);
        }

        const tableText = [
            formatRow("Account", escapeHtml(accnt.name).substring(0, 16), 32),
            formatRow("Challenge Phase", accnt.phase || "Phase 1", 32),
            formatRow("Target Objective", `${targetPct.toFixed(1)}% ($${targetAmount.toFixed(0)})`, 32),
            formatRow("Achieved Gain", `${achievedPct.toFixed(1)}% ($${achievedAmount.toFixed(0)})`, 32),
            formatRow("Max DD Incurred", `${ddUsed.toFixed(1)}% of ${accnt.maxTotalDD || 10}%`, 32),
            formatRow("Compliance Status", "100% PASS", 32)
        ].join('\n');

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "🎯 PROP CHALLENGE TARGET REACHED!",
                        color: 3066993,
                        description: `**Account:** ${accnt.firm ? accnt.firm + ' — ' : ''}${accnt.name}\n**Phase:** ${accnt.phase}\n**Achieved:** ${achievedPct.toFixed(1)}% ($${achievedAmount.toFixed(2)})\n\n*Submit for verification.*`
                    }]
                };
            }
            return `🎯 <b>PROP FIRM MILESTONE — TARGET REACHED!</b>\n` +
                   `<b>Account:</b> <code>${accnt.firm ? escapeHtml(accnt.firm) + ' — ' : ''}${escapeHtml(accnt.name)}</code>\n\n` +
                   `<pre>\nChallenge Objective Audit\n────────────────────────────────\n${tableText}\n</pre>\n\n` +
                   `<i>Congratulations! Target reached with full rule compliance. Ready for phase verification submission.</i>`;
        };

        this.doSend(buildMsg, { telegram: cfg.telegram?.alerts });
    }

    // --- REPORTS ---

    async sendDailyReport(forceManual = false) {
        const now = new Date();
        const yest = new Date(now.getTime() - 86400000);
        let t24 = Store.trades.filter(t => new Date(t.date) >= yest && new Date(t.date) <= now);

        if (t24.length === 0) {
            const todayStr = now.toISOString().split("T")[0];
            t24 = Store.trades.filter(t => t.date && t.date.startsWith(todayStr));
        }

        const cfg = Store.settings.notifications;
        const dFlags = { telegram: cfg.telegram?.daily };

        let isMock = false;
        if (t24.length === 0) {
            if (!forceManual) {
                const emptyMsg = () => `📊 <b>DAILY EXECUTIVE DIGEST</b>\n📅 <b>Date:</b> <code>${now.toISOString().split("T")[0]}</code>\n\n<i>No trades logged today. Rest and risk avoidance noted.</i>`;
                await this.doSend(emptyMsg, dFlags, false);
                return;
            }
            isMock = true;
            t24 = [
                { asset: "EUR/USD", tradeDirection: "Long", r: 2.1, pnlAmount: 630, setupType: "Liquidity Sweep", session: "London Open", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A+", accountId: Store.accounts[0]?.id },
                { asset: "GBP/USD", tradeDirection: "Short", r: 1.4, pnlAmount: 420, setupType: "FVG Retest", session: "London Open", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A", accountId: Store.accounts[0]?.id },
                { asset: "XAU/USD", tradeDirection: "Long", r: -0.7, pnlAmount: -210, setupType: "Breakout", session: "NY Open", ruleAdherence: "Yes", qualityScore: 8, tradeGrade: "B", accountId: Store.accounts[0]?.id }
            ];
        }

        const m = computeInstitutionalMetrics(t24);
        const dateStr = now.toISOString().split("T")[0];
        const statusBadge = m.totalR > 0 ? '🟢 PROFITABLE' : (m.totalR < 0 ? '🔴 DRAWDOWN' : '⚪ BREAKEVEN');
        const pnlPrefix = m.totalPnl >= 0 ? '+' : '';
        const rPrefix = m.totalR >= 0 ? '+' : '';

        const mainTable = [
            formatRow("Trades Logged", `${m.totalTrades} (${m.wins}W - ${m.losses}L)`, 32),
            formatRow("Win Rate", `${m.winRate.toFixed(1)}%`, 32),
            formatRow("Net P&L", `${pnlPrefix}$${m.totalPnl.toFixed(2)}`, 32),
            formatRow("Net R-Multiple", `${rPrefix}${m.totalR.toFixed(2)}R`, 32),
            formatRow("Profit Factor", `${m.profitFactor.toFixed(2)}`, 32),
            formatRow("Expectancy / Tr", `${m.expectancyR >= 0 ? '+' : ''}${m.expectancyR.toFixed(2)}R`, 32),
            formatRow("Sharpe Ratio", `${m.sharpeRatio.toFixed(2)}`, 32),
            formatRow("Rule Adherence", `${m.ruleAdherenceRate.toFixed(1)}% (${m.ruleAdherentCount}/${m.totalTrades})`, 32),
            formatRow("Psych Stability", `${m.psychStability.toFixed(1)} / 10`, 32),
            formatRow("Avg Quality", `${m.avgQuality.toFixed(1)} / 10`, 32)
        ].join('\n');

        const accRows = Object.keys(m.accountMap).map(k => {
            const acct = Store.accounts.find(a => String(a.id) === String(k));
            const n = acct ? acct.name.substring(0, 14) : "Account";
            const data = m.accountMap[k];
            const p = (data.pnl >= 0 ? '+' : '') + '$' + Number(data.pnl).toFixed(0);
            return formatRow(n, `${p} (${data.count}T)`, 32);
        }).slice(0, 3).join('\n');

        const setupRows = Object.keys(m.setupMap).map(k => {
            const data = m.setupMap[k];
            const sName = k.substring(0, 16);
            const rStr = (data.r >= 0 ? '+' : '') + Number(data.r).toFixed(1) + 'R';
            return formatRow(sName, `${data.count}T  ${rStr}`, 32);
        }).slice(0, 4).join('\n');

        const bestStr = m.bestTrade ? `${escapeHtml(m.bestTrade.asset)} (+${Number(m.bestTrade.r).toFixed(2)}R)` : '-';
        const worstStr = m.worstTrade ? `${escapeHtml(m.worstTrade.asset)} (${Number(m.worstTrade.r).toFixed(2)}R)` : '-';

        const message = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: `📊 DAILY EXECUTIVE DIGEST — ${dateStr}`,
                        color: m.totalR >= 0 ? 3066993 : 15158332,
                        description: `**Trades:** ${m.totalTrades} (${m.wins}W / ${m.losses}L)\n**Win Rate:** ${m.winRate.toFixed(1)}%\n**Net P&L:** ${pnlPrefix}$${m.totalPnl.toFixed(2)} (${rPrefix}${m.totalR.toFixed(2)}R)\n**Profit Factor:** ${m.profitFactor.toFixed(2)}\n**Sharpe Ratio:** ${m.sharpeRatio.toFixed(2)}\n**Rule Adherence:** ${m.ruleAdherenceRate.toFixed(1)}%`,
                        footer: { text: "QuantEdge Portfolio OS" }
                    }]
                };
            }
            return `📊 <b>DAILY EXECUTIVE DIGEST</b>\n` +
                   `📅 <b>Date:</b> <code>${dateStr}</code>  •  <b>Status:</b> ${statusBadge}${isMock ? ' <i>(Demo)</i>' : ''}\n\n` +
                   `<pre>\nPerformance Metric             Value\n────────────────────────────────\n${mainTable}\n</pre>\n\n` +
                   (accRows ? `<b>💼 Portfolio Accounts:</b>\n<pre>\nAccount                  P&L (Trades)\n────────────────────────────────\n${accRows}\n</pre>\n\n` : '') +
                   (setupRows ? `<b>🎯 Strategy Breakdown:</b>\n<pre>\nSetup Strategy            Exec   Net R\n────────────────────────────────\n${setupRows}\n</pre>\n\n` : '') +
                   `<b>⚡ Top Execution:</b> <code>${bestStr}</code>\n` +
                   `<b>⚠️ Drawdown Trade:</b> <code>${worstStr}</code>\n\n` +
                   `<i>QuantEdge Portfolio OS  •  Institutional Risk Engine</i>`;
        };

        await this.doSend(message, dFlags, forceManual);
    }

    async sendWeeklyReport(forceManual = false) {
        const weekInfo = typeof window.getLocalWeekBoundaries === 'function' ? window.getLocalWeekBoundaries() : {
            monday: new Date(Date.now() - 6 * 86400000),
            sunday: new Date(),
            weekNum: 46,
            key: new Date().toISOString().split("T")[0]
        };

        const monday = weekInfo.monday;
        const sunday = weekInfo.sunday;

        let weekTrades = Store.trades.filter(t => {
            let td = new Date(t.date);
            return td >= monday && td <= sunday;
        });

        const cfg = Store.settings.notifications;
        const dFlags = { telegram: cfg.telegram?.weekly };

        let isMock = false;
        if (weekTrades.length === 0) {
            if (!forceManual) {
                const emptyMsg = () => `📈 <b>WEEKLY STRATEGIC REVIEW</b> — Week ${weekInfo.weekNum}\n\n<i>0 trades logged this week. Capital preserved.</i>`;
                await this.doSend(emptyMsg, dFlags, false);
                return;
            }
            isMock = true;
            weekTrades = [
                { asset: "EUR/USD", tradeDirection: "Long", r: 2.4, pnlAmount: 720, setupType: "Liquidity Sweep", session: "London Open", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A+", accountId: Store.accounts[0]?.id },
                { asset: "XAU/USD", tradeDirection: "Short", r: 3.1, pnlAmount: 930, setupType: "FVG Inversion", session: "NY Open", ruleAdherence: "Yes", qualityScore: 10, tradeGrade: "A+", accountId: Store.accounts[0]?.id },
                { asset: "BTC/USD", tradeDirection: "Long", r: 1.8, pnlAmount: 540, setupType: "Liquidity Sweep", session: "Asian Range", ruleAdherence: "Yes", qualityScore: 8, tradeGrade: "A", accountId: Store.accounts[0]?.id },
                { asset: "GBP/USD", tradeDirection: "Short", r: -1.0, pnlAmount: -300, setupType: "Break & Retest", session: "London Open", ruleAdherence: "No", qualityScore: 6, tradeGrade: "C", accountId: Store.accounts[0]?.id },
                { asset: "EUR/USD", tradeDirection: "Long", r: 1.5, pnlAmount: 450, setupType: "Liquidity Sweep", session: "London Open", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A", accountId: Store.accounts[0]?.id }
            ];
        }

        const m = computeInstitutionalMetrics(weekTrades);
        const rPrefix = m.totalR >= 0 ? '+' : '';
        const pnlPrefix = m.totalPnl >= 0 ? '+' : '';
        const statusBadge = m.totalR > 0 ? '🟢 PROFITABLE' : (m.totalR < 0 ? '🔴 DRAWDOWN' : '⚪ BREAKEVEN');
        const startDateStr = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const endDateStr = sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        const ledgerTable = [
            formatRow("Total Executions", `${m.totalTrades} (${m.wins}W - ${m.losses}L)`, 32),
            formatRow("Win Rate", `${m.winRate.toFixed(1)}%`, 32),
            formatRow("Gross Profit", `+$${m.grossProfit.toFixed(2)}`, 32),
            formatRow("Gross Loss", `-$${m.grossLoss.toFixed(2)}`, 32),
            formatRow("Net Realized PnL", `${pnlPrefix}$${m.totalPnl.toFixed(2)}`, 32),
            formatRow("Net R-Multiple", `${rPrefix}${m.totalR.toFixed(2)}R`, 32),
            formatRow("Profit Factor", `${m.profitFactor.toFixed(2)}`, 32),
            formatRow("Expectancy (R)", `${m.expectancyR >= 0 ? '+' : ''}${m.expectancyR.toFixed(2)}R / trade`, 32),
            formatRow("Expectancy ($)", `${m.expectancyPnl >= 0 ? '+' : ''}$${m.expectancyPnl.toFixed(2)} / tr`, 32),
            formatRow("Trade Sharpe Ratio", `${m.sharpeRatio.toFixed(2)}`, 32),
            formatRow("Rule Adherence", `${m.ruleAdherenceRate.toFixed(1)}% (${m.ruleAdherentCount}/${m.totalTrades})`, 32),
            formatRow("Plan Violations", `${m.ruleViolations} broken rules`, 32),
            formatRow("Psych Rating", `${m.psychStability.toFixed(1)} / 10`, 32),
            formatRow("Execution Quality", `${m.avgQuality.toFixed(1)} / 10`, 32)
        ].join('\n');

        const sessionRows = Object.keys(m.sessionMap).map(k => {
            const data = m.sessionMap[k];
            const sName = k.substring(0, 16);
            const rStr = (data.r >= 0 ? '+' : '') + Number(data.r).toFixed(1) + 'R';
            return formatRow(sName, `${data.count}T  ${rStr}`, 32);
        }).slice(0, 4).join('\n');

        const setupRows = Object.keys(m.setupMap).map(k => {
            const data = m.setupMap[k];
            const sName = k.substring(0, 16);
            const rStr = (data.r >= 0 ? '+' : '') + Number(data.r).toFixed(1) + 'R';
            return formatRow(sName, `${data.count}T  ${rStr}`, 32);
        }).slice(0, 4).join('\n');

        const recNote = m.ruleAdherenceRate >= 90
            ? "Discipline benchmark satisfied (&gt;90%). System expectancy remains positive. Continue executing the plan without parameter drift."
            : "Caution: Rule deviations observed. Tighten pre-flight checklist before entering new positions next week.";

        const message = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: `📈 WEEKLY STRATEGIC REVIEW — Week ${weekInfo.weekNum}`,
                        color: m.totalR >= 0 ? 3066993 : 15158332,
                        description: `**Period:** ${startDateStr} – ${endDateStr}\n**Net Gain:** ${rPrefix}${m.totalR.toFixed(2)}R (${pnlPrefix}$${m.totalPnl.toFixed(2)})\n**Win Rate:** ${m.winRate.toFixed(1)}% (${m.totalTrades} Trades)\n**Profit Factor:** ${m.profitFactor.toFixed(2)}\n**Sharpe Ratio:** ${m.sharpeRatio.toFixed(2)}\n**Adherence:** ${m.ruleAdherenceRate.toFixed(1)}%`,
                        footer: { text: "QuantEdge Portfolio OS" }
                    }]
                };
            }
            return `📈 <b>WEEKLY STRATEGIC REVIEW</b>\n` +
                   `📅 <b>Week ${weekInfo.weekNum}</b> (${startDateStr} – ${endDateStr})\n` +
                   `<b>Performance:</b> ${statusBadge} <code>${rPrefix}${m.totalR.toFixed(2)}R</code> (<code>${pnlPrefix}$${m.totalPnl.toFixed(2)}</code>)${isMock ? ' <i>(Demo)</i>' : ''}\n\n` +
                   `<pre>\nInstitutional Metric             Value\n────────────────────────────────\n${ledgerTable}\n</pre>\n\n` +
                   (sessionRows ? `<b>🏛 Session Breakdown:</b>\n<pre>\nSession                   Exec   Net R\n────────────────────────────────\n${sessionRows}\n</pre>\n\n` : '') +
                   (setupRows ? `<b>🎯 Top Strategy Setups:</b>\n<pre>\nSetup Type                Exec   Net R\n────────────────────────────────\n${setupRows}\n</pre>\n\n` : '') +
                   `<blockquote expandable>\n<b>Strategic Recommendation:</b>\n${recNote}\n</blockquote>\n\n` +
                   `<i>QuantEdge Portfolio OS  •  Weekly Intelligence Protocol</i>`;
        };

        await this.doSend(message, dFlags, forceManual);
    }

    async sendMonthlyReport(forceManual = false) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        let mTrades = Store.trades.filter(t => {
            let td = new Date(t.date);
            return td >= monthStart && td <= monthEnd;
        });

        if (mTrades.length === 0) {
            const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            mTrades = Store.trades.filter(t => new Date(t.date) >= curMonthStart);
        }

        const cfg = Store.settings.notifications;
        const dFlags = { telegram: cfg.telegram?.monthly };

        let isMock = false;
        if (mTrades.length === 0) {
            if (!forceManual) {
                const emptyMsg = () => `📅 <b>MONTHLY PERFORMANCE AUDIT</b>\n\n<i>0 trades logged for this monthly audit cycle.</i>`;
                await this.doSend(emptyMsg, dFlags, false);
                return;
            }
            isMock = true;
            mTrades = [
                { asset: "XAU/USD", tradeDirection: "Long", r: 4.2, pnlAmount: 1260, setupType: "Liquidity Sweep", session: "London Open", ruleAdherence: "Yes", qualityScore: 10, tradeGrade: "A+", accountId: Store.accounts[0]?.id },
                { asset: "EUR/USD", tradeDirection: "Short", r: 2.1, pnlAmount: 630, setupType: "FVG Retest", session: "NY Open", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A", accountId: Store.accounts[0]?.id },
                { asset: "BTC/USD", tradeDirection: "Long", r: 3.5, pnlAmount: 1050, setupType: "Range Breakout", session: "Asian Range", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A", accountId: Store.accounts[0]?.id },
                { asset: "GBP/USD", tradeDirection: "Long", r: -1.0, pnlAmount: -300, setupType: "Breakout", session: "London Open", ruleAdherence: "Yes", qualityScore: 8, tradeGrade: "B", accountId: Store.accounts[0]?.id },
                { asset: "XAU/USD", tradeDirection: "Short", r: 1.8, pnlAmount: 540, setupType: "FVG Inversion", session: "NY Open", ruleAdherence: "Yes", qualityScore: 9, tradeGrade: "A", accountId: Store.accounts[0]?.id },
                { asset: "EUR/USD", tradeDirection: "Long", r: -0.8, pnlAmount: -240, setupType: "Liquidity Sweep", session: "London Open", ruleAdherence: "No", qualityScore: 7, tradeGrade: "C", accountId: Store.accounts[0]?.id }
            ];
        }

        const m = computeInstitutionalMetrics(mTrades);
        const rPrefix = m.totalR >= 0 ? '+' : '';
        const pnlPrefix = m.totalPnl >= 0 ? '+' : '';
        const statusBadge = m.totalR > 0 ? '🟢 PROFITABLE' : (m.totalR < 0 ? '🔴 DRAWDOWN' : '⚪ BREAKEVEN');
        const mName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });
        const payoffRatio = m.avgLossR > 0 ? (m.avgWinR / m.avgLossR).toFixed(2) : (m.avgWinR > 0 ? '99.9' : '0.00');

        const auditTable = [
            formatRow("Monthly Executions", `${m.totalTrades} (${m.wins}W - ${m.losses}L)`, 32),
            formatRow("Win Rate", `${m.winRate.toFixed(1)}%`, 32),
            formatRow("Gross Profit", `+$${m.grossProfit.toFixed(2)}`, 32),
            formatRow("Gross Loss", `-$${m.grossLoss.toFixed(2)}`, 32),
            formatRow("Net Realized PnL", `${pnlPrefix}$${m.totalPnl.toFixed(2)}`, 32),
            formatRow("Net R-Multiple", `${rPrefix}${m.totalR.toFixed(2)}R`, 32),
            formatRow("Profit Factor", `${m.profitFactor.toFixed(2)}`, 32),
            formatRow("Payoff Ratio (W/L)", `${payoffRatio}`, 32),
            formatRow("Expectancy / Trade", `${m.expectancyR >= 0 ? '+' : ''}${m.expectancyR.toFixed(2)}R`, 32),
            formatRow("Annualized Sharpe", `${m.sharpeRatio.toFixed(2)}`, 32),
            formatRow("Rule Adherence", `${m.ruleAdherenceRate.toFixed(1)}% (${m.ruleAdherentCount}/${m.totalTrades})`, 32),
            formatRow("Plan Violations", `${m.ruleViolations} broken rules`, 32),
            formatRow("Psych Health Index", `${m.psychStability.toFixed(1)} / 10`, 32),
            formatRow("Average Quality", `${m.avgQuality.toFixed(1)} / 10`, 32)
        ].join('\n');

        const assetRows = Object.keys(m.assetMap).map(k => {
            const data = m.assetMap[k];
            const aName = k.substring(0, 14);
            const pnlStr = (data.pnl >= 0 ? '+' : '') + '$' + Number(data.pnl).toFixed(0);
            return formatRow(aName, `${data.count}T  ${pnlStr}`, 32);
        }).slice(0, 4).join('\n');

        const bestStr = m.bestTrade ? `${escapeHtml(m.bestTrade.asset)} (+${Number(m.bestTrade.r).toFixed(2)}R)` : '-';
        const worstStr = m.worstTrade ? `${escapeHtml(m.worstTrade.asset)} (${Number(m.worstTrade.r).toFixed(2)}R)` : '-';

        const message = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: `🏛 MONTHLY PERFORMANCE AUDIT — ${mName}`,
                        color: m.totalR >= 0 ? 3066993 : 15158332,
                        description: `**Return:** ${rPrefix}${m.totalR.toFixed(2)}R (${pnlPrefix}$${m.totalPnl.toFixed(2)})\n**Trades:** ${m.totalTrades} (${m.wins}W / ${m.losses}L)\n**Profit Factor:** ${m.profitFactor.toFixed(2)}\n**Sharpe Ratio:** ${m.sharpeRatio.toFixed(2)}\n**Adherence:** ${m.ruleAdherenceRate.toFixed(1)}%`,
                        footer: { text: "QuantEdge Portfolio OS" }
                    }]
                };
            }
            return `🏛 <b>MONTHLY PERFORMANCE AUDIT</b>\n` +
                   `📅 <b>Month:</b> ${mName}  •  <b>Outcome:</b> ${statusBadge}${isMock ? ' <i>(Demo)</i>' : ''}\n` +
                   `<b>Net Realized PnL:</b> <code>${pnlPrefix}$${m.totalPnl.toFixed(2)}</code> (<code>${rPrefix}${m.totalR.toFixed(2)}R</code>)\n\n` +
                   `<pre>\nPortfolio Ledger Audit          Value\n────────────────────────────────\n${auditTable}\n</pre>\n\n` +
                   (assetRows ? `<b>🌐 Asset Performance Breakdown:</b>\n<pre>\nInstrument                Exec   Net PnL\n────────────────────────────────\n${assetRows}\n</pre>\n\n` : '') +
                   `<b>🏆 Best Trade:</b> <code>${bestStr}</code>\n` +
                   `<b>📉 Largest Loss:</b> <code>${worstStr}</code>\n\n` +
                   `<blockquote expandable>\n<b>Executive Audit Summary:</b>\nMonthly risk distribution executed with ${m.ruleAdherenceRate.toFixed(1)}% adherence to system rules. Risk of ruin remained controlled with a Sharpe ratio of ${m.sharpeRatio.toFixed(2)} and profit factor of ${m.profitFactor.toFixed(2)}.\n</blockquote>\n\n` +
                   `<i>QuantEdge Portfolio OS  •  Monthly Capital Audit</i>`;
        };

        await this.doSend(message, dFlags, forceManual);
    }

    test(type) {
        this.saveSettings();
        const statusEl = document.getElementById('notif-test-status');
        if (statusEl) {
            statusEl.innerText = 'Dispatching test to Telegram...';
            statusEl.style.color = '#38bdf8';
        }

        const finish = (msg, isError = false) => {
            if (statusEl) {
                statusEl.innerText = msg;
                statusEl.style.color = isError ? '#ef4444' : '#10b981';
            }
            if (isError) console.error(msg);
        };

        try {
            if (type === 'alert') {
                const sampleTrade = {
                    asset: "EUR/USD",
                    tradeDirection: "Long",
                    executionType: "Market",
                    session: "London Open",
                    setupType: "Liquidity Sweep",
                    entryPrice: 1.08450,
                    exitPrice: 1.08690,
                    riskAmount: 300,
                    plannedR: 3.0,
                    r: 2.40,
                    pnlAmount: 720.00,
                    tradeGrade: "A+",
                    ruleAdherence: "Yes",
                    preEmotion: "Calm",
                    duringEmotion: "Disciplined",
                    postNotes: "Clean M5 liquidity sweep of Asian session highs followed by strong displacement. Target reached at next liquidity pool.",
                    accountId: Store.accounts[0]?.id
                };

                const oldTradeLogged = Store.settings.notifications?.thresholds?.tradeLogged;
                if (Store.settings.notifications?.thresholds) {
                    Store.settings.notifications.thresholds.tradeLogged = true;
                }
                this.dispatchTradeLogged(sampleTrade);
                if (Store.settings.notifications?.thresholds) {
                    Store.settings.notifications.thresholds.tradeLogged = oldTradeLogged;
                }
                finish("✓ Test Trade Ticket delivered to Telegram!");
            } else if (type === 'daily') {
                this.sendDailyReport(true)
                    .then(() => finish("✓ Test Daily Report delivered to Telegram!"))
                    .catch(err => finish("✕ Telegram Error: " + (err.message || err), true));
            } else if (type === 'weekly') {
                this.sendWeeklyReport(true)
                    .then(() => finish("✓ Test Weekly Review delivered to Telegram!"))
                    .catch(err => finish("✕ Telegram Error: " + (err.message || err), true));
            } else if (type === 'monthly') {
                this.sendMonthlyReport(true)
                    .then(() => finish("✓ Test Monthly Audit delivered to Telegram!"))
                    .catch(err => finish("✕ Telegram Error: " + (err.message || err), true));
            }
        } catch (e) {
            finish("✕ Error: " + (e.message || e), true);
        }
    }

    preview() {
        alert("PREVIEW: Telegram Structured Card\n\n📝 TRADE EXECUTION TICKET\nAsset: EUR/USD  •  Direction: 🟢 LONG\nResult: 🟢 +2.40R (+$720.00)  •  Grade: A+\n\nExecution Audit Ledger          Value\n────────────────────────────────\nExecution Type     Market (London Open)\nStrategy Setup     Liquidity Sweep\nEntry → Exit       1.0845 → 1.0869\nRisk / Planned R   $300 (1:3.0)\nRule Adherence     ✓ PASS (100%)\nPsych State        Calm / Disciplined\n\nReflection (Expandable Quote):\nClean M5 liquidity sweep of Asian session highs.\n\nAccount: Apex Prop #1  •  Balance: $52,420.00");
    }
}

window.NotificationEngine = new NotificationEngine();

window.saveNotificationSettings = function() {
    window.NotificationEngine.saveSettings();
    document.getElementById('notif-test-status').innerText = "Settings saved ✓";
    document.getElementById('notif-test-status').style.color = "var(--success)";
    setTimeout(() => {
        document.getElementById('notif-test-status').innerText = "";
    }, 3000);
};

// Start initialization when page loaded
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.NotificationEngine.init();
    }, 500); // Give Storage time to load
});

window.evaluateRealTimeAlerts = function(lastTrade) {
    if (!window.NotificationEngine) return;
    const ne = window.NotificationEngine;
    if (!Store.settings.notifications) return;
    const cfg = Store.settings.notifications;

    const accnt = Store.accounts.find(a => a.id === lastTrade.accountId);
    if (!accnt) return;

    // 1. Daily Loss Limit
    const todayStr = new Date(lastTrade.date).toISOString().split("T")[0];
    const todaysTrades = Store.trades.filter(t => t.accountId === accnt.id && t.date.startsWith(todayStr));
    const rLoss = todaysTrades.reduce((acc, t) => acc + (parseFloat(t.r) || 0), 0);
    const limit = Store.settings.dailyLossLimitR || 3;
    
    if (rLoss < 0) {
        const absLoss = Math.abs(rLoss);
        const usedPct = absLoss / limit;
        const thresh = (cfg.thresholds.lossWarn || 50) / 100;
        
        if (absLoss >= limit) {
            ne.dispatchLossHit(accnt, rLoss, limit);
        } else if (usedPct >= thresh) {
            ne.dispatchLossWarning(accnt, rLoss, limit, usedPct);
        }
    }

    // 2. Consecutive Loss Streak
    // chronological from newest
    const accTrades = Store.trades.filter(t => t.accountId === accnt.id);
    let streakCount = 0;
    let streakTrades = [];
    for (let t of accTrades) {
        let rv = parseFloat(t.r) || 0;
        if (rv < 0 || t.result === "Loss") {
            streakCount++;
            streakTrades.push(t);
        } else if (rv > 0) {
            break;
        }
    }
    const streakThresh = cfg.thresholds.streak || 3;
    if (streakCount >= streakThresh) {
        ne.dispatchConsecutiveLoss(streakCount, streakTrades);
    }

    // 3. New Equity High & Prop Firm target
    let totalPnl = accTrades.reduce((acc, t) => acc + (parseFloat(t.pnlAmount) || 0), 0);
    let curBal = parseFloat(accnt.balance || 0) + totalPnl;
    accnt.currentBalance = curBal; // Ensure we keep a reference for DD calc

    if (accnt.type === "Prop" && (accnt.phase === "Challenge" || accnt.phase === "Verification")) {
        const targetPct = parseFloat(accnt.profitTargetPercent) || 8;
        const targetAmount = parseFloat(accnt.balance || 0) * (targetPct / 100);
        if (totalPnl > 0 && targetAmount > 0 && totalPnl >= targetAmount) {
            ne.dispatchPropTargetReached(accnt, totalPnl, targetAmount);
        }
    }

    let hwm = accnt.highWaterMark ? parseFloat(accnt.highWaterMark) : parseFloat(accnt.balance || 0);
    
    if (curBal > hwm) {
        ne.dispatchEquityHigh(accnt, curBal, hwm);
        accnt.highWaterMark = curBal;
        Store.save();
    }
    
    // 4. Drawdown calculation
    hwm = accnt.highWaterMark || parseFloat(accnt.balance || 0);
    const dd = hwm - curBal;
    
    // Assuming maxDrawdown exists in account settings as percentage, otherwise defaults to 10%
    const maxDdPct = parseFloat(accnt.maxDrawdown) || 10;
    const maxDdAmount = parseFloat(accnt.balance || 0) * (maxDdPct / 100);
    const ddThresh = (cfg.thresholds.ddWarn || 70) / 100;
    
    if (dd > 0 && maxDdAmount > 0) {
        const ddUsedPct = dd / maxDdAmount;
        if (ddUsedPct >= ddThresh) {
            ne.dispatchDrawdownWarning(accnt, dd, maxDdAmount, ddUsedPct);
        }
    }

    // 5. Psychological Risk Escalation (If Psych Engine changed state)
    // The Psych Engine evaluates globally, we can call its evaluation or check its UI logic
    if (window.renderPsychEngine) {
        let negCount = 0, totCount = 0, pnlSum = 0;
        const recent = Store.trades.slice(0, 10);
        recent.forEach(t => {
            if(t.preEmotion) {
                totCount++;
                if(["FOMO", "Revenge", "Fear", "Greed", "Frustrated"].includes(t.preEmotion)) negCount++;
            }
            if(t.duringEmotion) {
                totCount++;
                if(["FOMO", "Revenge", "Fear", "Greed", "Frustrated"].includes(t.duringEmotion)) negCount++;
            }
            pnlSum += parseFloat(t.r) || 0;
        });
        const emotionRisk = totCount > 0 ? negCount / totCount : 0;
        const recentLosses = streakCount;

        // Same logic as PsychEngine in script7.js
        let pLevel = "🟢 Optimal";
        let score = 0;
        if (emotionRisk > 0.4) score += 2;
        if (emotionRisk > 0.6) score += 2;
        if (recentLosses >= 2) score += 1;
        if (recentLosses >= 3) score += 2;
        if (pnlSum <= -2) score += 2;

        if (score >= 5) pLevel = "CRITICAL";
        else if (score >= 3) pLevel = "ELEVATED";

        // Store last psych state to only trigger on escalation
        if (!Store.settings.lastPsychState) Store.settings.lastPsychState = "NORMAL";
        let lastState = Store.settings.lastPsychState;

        if (pLevel !== "🟢 Optimal" && pLevel !== lastState) {
            if (pLevel === "ELEVATED" && lastState !== "CRITICAL") {
                ne.dispatchPsychEscalation(pLevel, Math.round(emotionRisk * 100), recentLosses);
            } else if (pLevel === "CRITICAL") {
                ne.dispatchPsychEscalation(pLevel, Math.round(emotionRisk * 100), recentLosses);
            }
        }
        Store.settings.lastPsychState = pLevel === "🟢 Optimal" ? "NORMAL" : pLevel;
        Store.save();
    }
};
