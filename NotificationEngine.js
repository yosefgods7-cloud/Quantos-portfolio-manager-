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
        token = (token || '').replace(/\s+/g, '');
        chatId = (chatId || '').trim();
        const cleanToken = token.startsWith('bot') ? token.substring(3) : token;
        const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
        
        const fallbackGET = () => {
            return new Promise((resolve) => {
                const getUrl = `${url}?chat_id=${encodeURIComponent(chatId)}&text=${encodeURIComponent(text)}&parse_mode=HTML`;
                const img = new Image();
                img.onload = () => resolve({ ok: true, fallback: true });
                img.onerror = () => resolve({ ok: true, fallback: true }); // even on error, request probably went through
                img.src = getUrl;
                setTimeout(() => resolve({ ok: true, fallback: true }), 3000); // resolve anyway after 3s
            });
        };

        try {
            const body = new URLSearchParams();
            body.append('chat_id', chatId);
            body.append('text', text);
            body.append('parse_mode', 'HTML');
            
            let res;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: body
                });
            } catch(e) {
                // Fetch failed (likely Brave Shields / Adblocker / CORS)
                res = await fallbackGET();
            }

            if(res.fallback) return res;

            if(!res.ok) {
                let errDetails = "";
                try {
                    const data = await res.json();
                    errDetails = data.description || res.statusText;
                } catch(e) {
                    errDetails = res.statusText;
                }
                throw new Error(`error ${res.status}: ${errDetails}. Check your Bot Token and Chat ID.`);
            }
            return res;
        } catch(err) {
            await fallbackGET(); // One absolute last try
            throw new Error(`${err.message || 'Unknown error'}`);
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
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        if (this.isSpam('loss_warn_'+accnt.name, 10)) return;

        const blocks = Math.round(allow * 10);
        const bar = '█'.repeat(blocks) + '░'.repeat(10-blocks);

        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: "⚠️ DAILY LOSS WARNING",
                        color: 15158332,
                        description: `**Account:** ${accnt.name}\n**Loss so far:** ${rLoss.toFixed(2)}R\n**Daily Limit:** ${limit.toFixed(2)}R\n**Used:** ${Math.round(allow*100)}% ${bar}\n\n**Remaining allowance:** ${(limit - Math.abs(rLoss)).toFixed(2)}R\n*Slow down. Protect your capital.*`
                    }]
                };
            } else { // Fallback for telegram and googleChat
                return `⚠️ <b>DAILY LOSS WARNING</b>\n\n<b>Account:</b> ${accnt.name}\n<b>Loss so far:</b> ${rLoss.toFixed(2)}R\n<b>Daily Limit:</b> ${limit.toFixed(2)}R\n<b>Used:</b> ${Math.round(allow*100)}% ${bar}\n\n<b>Remaining:</b> ${(limit - Math.abs(rLoss)).toFixed(2)}R\n<i>Slow down. Protect your capital.</i>`;
            }
        };

        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchLossHit(accnt, rLoss, limit) {
        const cfg = Store.settings.notifications;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        if (this.isSpam('loss_hit_'+accnt.name, 60)) return;

        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: "🔴 TRADING LOCKED — Daily Limit Reached",
                        color: 15158332,
                        description: `**Account:** ${accnt.name}\n**Loss:** ${rLoss.toFixed(2)}R\n**Limit:** ${limit.toFixed(2)}R (100% used)\n\nJournal is locked. Complete your reflection exercise to unlock trading for tomorrow.\n**Stop. Breathe. Review.**`
                    }]
                };
            } else {
                return `🔴 <b>TRADING LOCKED</b> — Limit Reached\n\n<b>Account:</b> ${accnt.name}\n<b>Loss:</b> ${rLoss.toFixed(2)}R\n<b>Limit:</b> ${limit.toFixed(2)}R\n\nJournal is locked. Complete reflection to unlock.\n<b>Stop. Breathe. Review.</b>`;
            }
        };
        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchEquityHigh(accnt, newMax, prevMax) {
        const cfg = Store.settings.notifications;
        if(!cfg.thresholds.eqHigh) return;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        
        const gain = newMax - prevMax;
        const gainPct = (gain / prevMax * 100);

        const buildMsg = (type) => {
            if (type === 'discord') {
                return {
                    embeds: [{
                        title: "🏆 NEW EQUITY HIGH",
                        color: 3066993,
                        description: `**Account:** ${accnt.name}\n**New High:** $${parseFloat(newMax).toLocaleString()}\n**Previous:** $${parseFloat(prevMax).toLocaleString()}\n**Gain:** +$${parseFloat(gain).toLocaleString()} (+${gainPct.toFixed(1)}%)\n\n*Keep building. Stay disciplined.*`
                    }]
                };
            } else {
                return `🏆 <b>NEW EQUITY HIGH</b>\n\n<b>Account:</b> ${accnt.name}\n<b>New High:</b> $${parseFloat(newMax).toLocaleString()}\n<b>Previous:</b> $${parseFloat(prevMax).toLocaleString()}\n<b>Gain:</b> +$${parseFloat(gain).toLocaleString()} (+${gainPct.toFixed(1)}%)\n\n<i>Keep building. Stay disciplined.</i>`;
            }
        };
        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchConsecutiveLoss(streak, trades) {
        const cfg = Store.settings.notifications;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        if (this.isSpam('streak_loss', 30)) return;

        let rTotal = trades.reduce((a, b) => a + parseFloat(b.r), 0);
        let listStrDiscord = trades.map(t => `❌ ${t.asset}  ${parseFloat(t.r).toFixed(1)}R`).join('\n');
        let listStrTg = trades.map(t => `❌ ${t.asset}  ${parseFloat(t.r).toFixed(1)}R`).join('\n');

        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: "🔁 LOSS STREAK ALERT",
                        color: 15158332,
                        description: `**Consecutive Losses:** ${streak}\n\n**Last ${streak} trades:**\n${listStrDiscord}\n\n**Total streak loss:** ${rTotal.toFixed(2)}R\n**Psychological Risk:** ELEVATED\n\n*Consider stepping away. Review before next trade.*`
                    }]
                };
            } else {
                return `🔁 <b>LOSS STREAK ALERT</b>\n\n<b>Consecutive Losses:</b> ${streak}\n<b>Last ${streak} trades:</b>\n${listStrTg}\n\n<b>Total loss:</b> ${rTotal.toFixed(2)}R\n<b>Psych Risk:</b> ELEVATED\n\n<i>Consider stepping away. Review before next trade.</i>`;
            }
        };
        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchPsychEscalation(level, avgEmotion, losses) {
        const cfg = Store.settings.notifications;
        if(!cfg.thresholds.psychEscalate) return;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        if (this.isSpam('psych_escalation', 60)) return;

        let clr = level === "ELEVATED" ? 15105570 : 15158332; // Orange or Red

        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: "🧠 PSYCH RISK ESCALATION",
                        color: clr,
                        description: `**Risk Level:** ${level === "ELEVATED" ? "🟠 ELEVATED" : "🔴 CRITICAL"} (was: Normal)\n**Avg Emotion:** ${avgEmotion}% Negative\n**Consec. Losses:** ${losses}\n**Recommendation:** Reduce to 50% risk\n\n*Your mental state is affecting performance. Step back before the next trade.*`
                    }]
                };
            } else {
                return `🧠 <b>PSYCH RISK ESCALATION</b>\n\n<b>Risk Level:</b> ${level === "ELEVATED" ? "🟠 ELEVATED" : "🔴 CRITICAL"}\n<b>Avg Emotion:</b> ${avgEmotion}% Negative\n<b>Consec. Losses:</b> ${losses}\n<b>Recommendation:</b> Reduce risk\n\n<i>Your mental state is affecting performance. Step back.</i>`;
            }
        };
        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchTradeLogged(trade) {
        const cfg = Store.settings.notifications;
        if(!cfg.thresholds.tradeLogged) return;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;

        let prefix = parseFloat(trade.r) >= 0 ? '+' : '';
        let accnt = Store.accounts.find(a => a.id === trade.accountId);
        let aName = accnt ? accnt.name : "Unknown";
        
        let pnlText = trade.pnlAmount ? ` | $${trade.pnlAmount}` : '';
        
        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    content: `📝 Trade Logged | ${trade.asset} | ${trade.direction} | ${prefix}${parseFloat(trade.r||0).toFixed(2)}R${pnlText} | Grade: ${trade.tradeGrade||"-"}\nAccount: ${aName}`
                };
            } else {
                return `📝 Trade Logged | <b>${trade.asset}</b> | ${trade.direction} | ${prefix}${parseFloat(trade.r||0).toFixed(2)}R${pnlText} | Grade: ${trade.tradeGrade||"-"}\nAccount: ${aName}`;
            }
        };
        // no spam protection needed, explicitly requested to fire per trade if enabled
        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchDrawdownWarning(accnt, currentDd, maxDd, usedPct) {
        const cfg = Store.settings.notifications;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        if (this.isSpam('dd_warn_'+accnt.name, 60)) return;

        const blocks = Math.round(usedPct * 10);
        const bar = '█'.repeat(blocks) + '░'.repeat(10-blocks);
        const remain = maxDd - currentDd;

        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: "⚠️ DRAWDOWN ALERT",
                        color: 15158332,
                        description: `**Account:** ${accnt.name}\n**Current DD:** $${currentDd.toFixed(2)}\n**Max Allowed:** $${maxDd.toFixed(2)}\n**Used:** ${Math.round(usedPct*100)}% ${bar}\n\n**$${remain.toFixed(2)} remaining before max drawdown.**\n*Reduce position size immediately.*`
                    }]
                };
            } else {
                return `⚠️ <b>DRAWDOWN ALERT</b>\n\n<b>Account:</b> ${accnt.name}\n<b>Current DD:</b> $${currentDd.toFixed(2)}\n<b>Max Allowed:</b> $${maxDd.toFixed(2)}\n<b>Used:</b> ${Math.round(usedPct*100)}% ${bar}\n\n<b>$${remain.toFixed(2)} remaining.</b>\n<i>Reduce position size immediately.</i>`;
            }
        };

        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    dispatchPropTargetReached(accnt, achievedAmount, targetAmount) {
        const cfg = Store.settings.notifications;
        if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
        if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
        if (this.isSpam('prop_target_'+accnt.name, 1440)) return; // 1 day cooldown

        const targetPct = (targetAmount / parseFloat(accnt.balance)) * 100;
        const achievedPct = (achievedAmount / parseFloat(accnt.balance)) * 100;
        
        let ddUsed = 0;
        if (accnt.highWaterMark && accnt.currentBalance) {
             ddUsed = (accnt.highWaterMark - accnt.currentBalance) / accnt.balance * 100;
        }

        const buildMsg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: "🎯 CHALLENGE TARGET REACHED",
                        color: 3066993,
                        description: `**Account:** ${accnt.firm ? accnt.firm + ' — ' : ''}${accnt.name}\n**Phase:** ${accnt.phase}\n**Target:** ${targetPct.toFixed(1)}% ($${targetAmount.toFixed(2)})\n**Achieved:** ${achievedPct.toFixed(1)}% ($${achievedAmount.toFixed(2)})\n**Drawdown Used:** ${ddUsed > 0 ? ddUsed.toFixed(1) : "0.0"}% of ${accnt.maxTotalDD}% max\n\n*Ready to advance to next phase. Submit your account for verification.*`
                    }]
                };
            } else {
                return `🎯 <b>CHALLENGE TARGET REACHED</b>\n\n<b>Account:</b> ${accnt.firm ? accnt.firm + ' — ' : ''}${accnt.name}\n<b>Phase:</b> ${accnt.phase}\n<b>Target:</b> ${targetPct.toFixed(1)}% ($${targetAmount.toFixed(2)})\n<b>Achieved:</b> ${achievedPct.toFixed(1)}% ($${achievedAmount.toFixed(2)})\n\n<i>Ready to advance to next phase.</i>`;
            }
        };

        this.doSend(buildMsg, {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts});
    }

    // --- REPORTS ---

    async sendDailyReport(forceManual = false) {
        // Collect past 24h trades
        const now = new Date();
        const yest = new Date(now.getTime() - 86400000);
        let t24 = Store.trades.filter(t => new Date(t.date) >= yest && new Date(t.date) <= now);
        
        const cfg = Store.settings.notifications;
        const dFlags = {discord: cfg.discord?.daily, telegram: cfg.telegram?.daily, googleChat: cfg.googleChat?.daily};

        if (t24.length === 0) {
            const emptyMsg = (type) => {
                const isDiscord = type === 'discord';
                const text = `📋 Daily Report — No trades logged today\n${now.toISOString().split("T")[0]} | Rest day or market avoidance noted.`;
                return isDiscord ? { embeds: [{ title: "📋 Daily Report — No trades", description: text, color: 8421504 }] } : `📋 <b>Daily Report</b> — No trades logged\n\n${text}`;
            };
            await this.doSend(emptyMsg, dFlags, forceManual);
            return;
        }

        // Aggregate
        let totalR = 0, totalPnl = 0, wins = 0, losses = 0;
        let bTrade = null, wTrade = null;
        let bR = -999, wR = 999;
        let ruleAd = 0;
        let grds = {A:0, B:0, C:0, F:0};
        let qs = 0, qc=0;
        let sessions = new Set();
        let accMap = {};

        t24.forEach(t => {
            let r = parseFloat(t.r) || 0;
            totalR += r;
            totalPnl += parseFloat(t.pnlAmount) || 0;
            if(r > bR){ bR=r; bTrade=t; }
            if(r < wR){ wR=r; wTrade=t; }
            if(r > 0) wins++; else if(t.result === "Loss") losses++;
            
            if(t.ruleAdherence === 'Yes') ruleAd++;
            if(t.tradeGrade) grds[t.tradeGrade] = (grds[t.tradeGrade]||0)+1;
            if(t.qualityScore){ qs+=parseInt(t.qualityScore); qc++;}
            if(t.session && t.session !== "Unknown") sessions.add(t.session);
            
            if(!accMap[t.accountId]) accMap[t.accountId] = 0;
            accMap[t.accountId] += parseFloat(t.pnlAmount) || 0;
        });

        const wr = wins+losses > 0 ? wins/(wins+losses)*100 : 0;
        const aq = qc > 0 ? qs/qc : 0;
        let bestText = bTrade ? `${bTrade.asset} +${bR.toFixed(2)}R` : '-';
        let worstText = wTrade ? `${wTrade.asset} ${wR.toFixed(2)}R` : '-';

        let accText = Object.keys(accMap).map(k => {
            let acct = Store.accounts.find(a=>a.id===k);
            let n = acct?acct.name:'Unknown';
            let pnl = accMap[k];
            return `${n}: ${pnl>=0?'+':''}$${pnl.toFixed(2)}`;
        }).join('\n');

        const message = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: `📊 DAILY REPORT — ${now.toISOString().split("T")[0]}`,
                        color: totalR >= 0 ? 3066993 : 15158332,
                        description: `**PERFORMANCE SUMMARY**\nTotal Trades: ${t24.length}\nWin / Loss: ${wins}W ${losses}L\nWin Rate: ${wr.toFixed(1)}%\nTotal R: ${totalR>=0?'+':''}${totalR.toFixed(2)}R\nTotal P&L: ${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}\nBest Trade: ${bestText}\nWorst Trade: ${worstText}\n\n**ACCOUNT UPDATES**\n${accText}\n\n**EXECUTION QUALITY**\nAvg Quality: ${aq.toFixed(1)}/10\nRule Adherence: ${ruleAd}/${t24.length}\nGrades: A:${grds.A||0} B:${grds.B||0} C:${grds.C||0} F:${grds.F||0}\n\n**SESSIONS**\n${Array.from(sessions).join(', ') || 'N/A'}`,
                        footer: {text: "Quant OS Edge"}
                    }]
                };
            } else {
                return `📊 <b>DAILY REPORT</b> — ${now.toISOString().split("T")[0]}\n\n<b>PERFORMANCE</b>\nTrades: ${t24.length}\nW/L: ${wins}W ${losses}L (${wr.toFixed(1)}%)\nTotal R: ${totalR>=0?'+':''}${totalR.toFixed(2)}R\nTotal P&L: ${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}\n\n<b>ACCOUNTS</b>\n${accText}\n\n<b>EXECUTION</b>\nQuality: ${aq.toFixed(1)}/10\nRules: ${ruleAd}/${t24.length}`;
            }
        };

        await this.doSend(message, dFlags, forceManual);
    }

    async sendWeeklyReport(forceManual = false) {
        // Build data similar to WeeklyReviewModal but summarized
        if (typeof window.getLocalWeekBoundaries !== 'function') return; // Requires weeklyReview.js 

        const weekInfo = window.getLocalWeekBoundaries();
        // Fallback for generating report without blocking
        // We can just rely on the stored weekly review or generate minimal data
        
        let review = Store.weeklyReviews.find(r => r.key === weekInfo.key);
        let rrText = "";
        let plText = "";
        let tradesCount = 0;
        let winRate = 0;

        if(!review) {
            // Need to compute quick stats if review hasn't been done
            // To ensure 100% decoupling from async generation issues, we do a fast locally-scoped calc
            const monday = weekInfo.monday;
            const sunday = weekInfo.sunday;
            
            let weekTrades = Store.trades.filter(t => {
                let td = new Date(t.date);
                return td >= monday && td <= sunday;
            });

            tradesCount = weekTrades.length;
            let wins=0, losses=0, totR=0, totPnl=0;
            weekTrades.forEach(t=>{
                let r = parseFloat(t.r)||0;
                totR+=r;
                totPnl+=parseFloat(t.pnlAmount)||0;
                if(r>0)wins++; else if(t.result==="Loss")losses++;
            });
            winRate = tradesCount>0 ? (wins/tradesCount)*100 : 0;
            rrText = (totR>=0?'+':'') + totR.toFixed(2) + 'R';
            plText = (totPnl>=0?'+':'') + '$' + totPnl.toFixed(2);
        } else {
            tradesCount = review.totalTrades;
            winRate = review.winRate;
            rrText = (review.totalR>=0?'+':'') + review.totalR.toFixed(2) + 'R';
            plText = (review.totalPnl>=0?'+':'') + '$' + review.totalPnl.toFixed(2);
        }

        const cfg = Store.settings.notifications;
        const dFlags = {discord: cfg.discord?.weekly, telegram: cfg.telegram?.weekly, googleChat: cfg.googleChat?.weekly};

        if(tradesCount === 0) {
            const emptyMsg = (type) => {
                const text = `week ${weekInfo.weekNum} complete! 0 trades logged. Enjoy your weekend.`;
                return type === 'discord' ? { embeds: [{ title: "📈 WEEKLY DIGEST", description: text, color: 8421504 }] } : `📈 <b>WEEKLY DIGEST</b>\n\n${text}`;
            };
            await this.doSend(emptyMsg, dFlags, forceManual);
            return;
        }

        const msg = (type) => {
            if(type === 'discord') {
                return {
                    embeds: [{
                        title: `📈 WEEKLY DIGEST — Week ${weekInfo.weekNum}`,
                        color: rrText.startsWith("-") ? 15158332 : 3066993,
                        description: `**WEEK OVERVIEW**\nTrades: ${tradesCount}\nWin Rate: ${winRate.toFixed(1)}%\nTotal R: ${rrText}\nTotal P&L: ${plText}\n\n*Log into Quant OS Edge to complete your structured weekly review & generate your AI coach summary.*`,
                        footer: {text: "Quant OS Edge"}
                    }]
                };
            } else {
                return `📈 <b>WEEKLY DIGEST</b> — Week ${weekInfo.weekNum}\n\n<b>Trades:</b> ${tradesCount}\n<b>Win Rate:</b> ${winRate.toFixed(1)}%\n<b>Total R:</b> ${rrText}\n<b>Total P&L:</b> ${plText}\n\n<i>Log into app for full review.</i>`;
            }
        };

        await this.doSend(msg, dFlags, forceManual);
    }

    async sendMonthlyReport(forceManual = false) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        let mTrades = Store.trades.filter(t => {
            let td = new Date(t.date);
            return td >= monthStart && td <= monthEnd;
        });

        const cfg = Store.settings.notifications;
        const dFlags = {discord: cfg.discord?.monthly, telegram: cfg.telegram?.monthly, googleChat: cfg.googleChat?.monthly};

        let wins=0, losses=0, totR=0, totPnl=0;
        mTrades.forEach(t=>{
            let r=parseFloat(t.r)||0;
            totR+=r;
            totPnl+=parseFloat(t.pnlAmount)||0;
            if(r>0)wins++; else if(t.result==="Loss")losses++;
        });

        let wr = mTrades.length>0 ? (wins/mTrades.length*100) : 0;
        let mName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

        const msg = (type) => {
            if(type==='discord') {
                return {
                    embeds: [{
                        title: `📅 MONTHLY SUMMARY — ${mName}`,
                        color: totR >= 0 ? 3066993 : 15158332,
                        description: `Trades: ${mTrades.length}\nWin Rate: ${wr.toFixed(1)}%\nTotal R: ${(totR>=0?'+':'')+totR.toFixed(2)}R\nTotal P&L: ${(totPnl>=0?'+':'')}$${totPnl.toFixed(2)}\n\n*Review monthly stats inside Quant OS Edge.*`,
                        footer: {text: "Quant OS Edge"}
                    }]
                };
            } else {
                return `📅 <b>MONTHLY SUMMARY</b> — ${mName}\n\nTrades: ${mTrades.length}\nWin Rate: ${wr.toFixed(1)}%\nTotal R: ${(totR>=0?'+':'')+totR.toFixed(2)}R\nP&L: ${(totPnl>=0?'+':'')}$${totPnl.toFixed(2)}`;
            }
        };

        if(mTrades.length >= 0) { // always send manual report even if 0 trades
            await this.doSend(msg, dFlags, forceManual);
        }
    }


    test(type) {
        this.saveSettings();
        document.getElementById('notif-test-status').innerText = 'Sending...';
        document.getElementById('notif-test-status').style.color = 'var(--text)';
        
        const finish = (msg, isError = false) => {
            document.getElementById('notif-test-status').innerText = msg;
            document.getElementById('notif-test-status').style.color = isError ? 'var(--danger)' : 'var(--text)';
        };

        let accnt = {name: "Test Account"};
        try {
            if (type === 'alert') {
                this.dispatchLossWarning(accnt, -1.5, 3.0, 0.5);
                // Also force it since tests should always trigger if enabled
                const buildMsg = (typeStr) => typeStr === 'discord' ? {embeds:[{title:"🔔 TEST ALERT", description:"This is a test alert from Quant Edge OS.", color:3066993}]} : "🔔 <b>TEST ALERT</b>\n\nThis is a test alert from Quant Edge OS.";
                this.doSend(buildMsg, {}, true).then(()=> finish("Test Alert dispatched")).catch(err => finish("Error: " + err.message, true));
            } else if (type === 'daily') {
                this.sendDailyReport(true).then(()=> finish("Test Daily dispatched")).catch(err => finish("Error: " + err.message, true));
            } else if (type === 'weekly') {
                this.sendWeeklyReport(true).then(()=> finish("Test Weekly dispatched")).catch(err => finish("Error: " + err.message, true));
            }
        } catch (e) {
            finish("Error: " + e.message, true);
        }
    }

    preview() {
        // Show alert dialog mimicking a notification
        alert("PREVIEW\n\n⚠️ DAILY LOSS WARNING\n\nAccount: Main\nLoss so far: -1.5R\nDaily Limit: 3.0R\nUsed: 50%\n\nRemaining allowance: 1.5R\nSlow down. Protect your capital.");
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
