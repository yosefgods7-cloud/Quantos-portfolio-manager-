function getLocalWeekBoundaries(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  const weekNum = Math.ceil((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000 / 7);
  
  return { 
    monday, 
    sunday, 
    weekNum, 
    key: monday.toISOString().split("T")[0]
  };
}
window.getLocalWeekBoundaries = getLocalWeekBoundaries;

function getPreviousWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getLocalWeekBoundaries(d).key;
}

window.checkWeeklyReviewTrigger = function() {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday
    
    // We only trigger Sunday prompt or Monday missing prompt
    const alertBox = document.getElementById("weekly-review-alert");
    const msg = document.getElementById("weekly-review-msg");
    const btn = document.getElementById("weekly-review-alert-btn");
    
    if(!alertBox || !msg || !btn || !Store.weeklyReviews) return;
    
    const currentWeekInfo = getLocalWeekBoundaries();
    const prevWeekKey = getPreviousWeekKey();
    
    const currentWeekReviewed = Store.weeklyReviews.find(r => r.key === currentWeekInfo.key);
    const prevWeekReviewed = Store.weeklyReviews.find(r => r.key === prevWeekKey);
    
    if (day === 0) {
        // Sunday
        alertBox.style.display = "flex";
        if (currentWeekReviewed) {
            alertBox.style.background = "rgba(34, 197, 94, 0.15)";
            alertBox.style.borderColor = "var(--success)";
            alertBox.style.color = "var(--success)";
            msg.innerHTML = `✓ Week ${currentWeekInfo.weekNum} reviewed — review your intentions.`;
            btn.innerText = "View Summary";
            btn.style.background = "var(--success)";
            btn.onclick = () => window.openWeeklyReviewModal(currentWeekInfo.key);
        } else {
            alertBox.style.background = "rgba(234, 179, 8, 0.15)";
            alertBox.style.borderColor = "var(--warning)";
            alertBox.style.color = "var(--warning)";
            msg.innerHTML = `📋 Weekly review is due — reflect on your week before markets open.`;
            btn.innerText = "Start Weekly Review";
            btn.style.background = "var(--warning)";
            btn.onclick = () => window.openWeeklyReviewModal();
        }
    } else if (day === 1 && !prevWeekReviewed) {
        // Monday and missed last week
        alertBox.style.display = "flex";
        alertBox.style.background = "rgba(239, 68, 68, 0.15)";
        alertBox.style.borderColor = "var(--danger)";
        alertBox.style.color = "var(--danger)";
        msg.innerHTML = `⚠ Last week's review was not completed.`;
        btn.innerText = "Complete Now";
        btn.style.background = "var(--danger)";
        btn.onclick = () => window.openWeeklyReviewModal(prevWeekKey);
    } else {
        alertBox.style.display = "none";
    }
};

window.renderWeeklyReviewHistory = function() {
    const tbody = document.getElementById("weekly-review-history-body");
    if(!tbody || !Store.weeklyReviews) return;
    
    if (Store.weeklyReviews.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 24px;">No weekly reviews saved yet.</td></tr>`;
        return;
    }
    
    Store.weeklyReviews.sort((a,b) => new Date(b.key) - new Date(a.key));
    
    tbody.innerHTML = Store.weeklyReviews.map(review => {
        let rMultiple = (review.totalR || 0).toFixed(2);
        let winRate = (review.winRate || 0).toFixed(1);
        let stars = "⭐".repeat(review.manual?.rating || 0) + "☆".repeat(5 - (review.manual?.rating || 0));
        let rrColor = rMultiple >= 0 ? 'var(--success)' : 'var(--danger)';
        
        return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px 16px; font-weight: 500;">
                    Week ${review.weekNum} <span style="font-size:0.8rem; color:var(--muted); margin-left:8px;">${review.key}</span>
                </td>
                <td style="padding: 12px 16px; font-size: 1.1rem; color: var(--warning);">${stars}</td>
                <td style="padding: 12px 16px; color: ${rrColor}; font-weight: 600;">${rMultiple >= 0 ? '+' : ''}${rMultiple}R</td>
                <td style="padding: 12px 16px;">${winRate}%</td>
                <td style="padding: 12px 16px; color: var(--muted);">${review.manual?.nextFocus || "-"}</td>
                <td style="padding: 12px 0; text-align: right;">
                    <button class="secondary" onclick="openWeeklyReviewModal('${review.key}')" style="padding: 4px 12px; font-size: 0.8rem;">View</button>
                </td>
            </tr>
        `;
    }).join("");
};

// Hook into existing render
const originalRenderAll = window.renderAll;
window.renderAll = function() {
    if(originalRenderAll) originalRenderAll();
    checkWeeklyReviewTrigger();
    renderWeeklyReviewHistory();
};

window.renderWeeklyReviewModal = async function(data, isHistorical, isEditable) {
    const container = document.getElementById("weekly-review-content");
    const label = document.getElementById("weekly-review-step-lbl");
    const actions = document.getElementById("weekly-review-read-only-actions");
    const saveBtn = document.getElementById("btn-save-weekly-review");
    
    if (!data) return;
    
    if (isHistorical && !isEditable) {
        label.innerText = "Completed / Locked";
        label.style.background = "var(--surface)";
        label.style.color = "var(--success)";
        saveBtn.style.display = "none";
        const skipBtn = document.getElementById("btn-skip-ai-weekly-review");
        if(skipBtn) skipBtn.style.display = "none";
        actions.innerHTML = `
            <button class="secondary" onclick="exportWeeklyReviewPDF()"><i data-lucide="file-text"></i> Export PDF</button>
        `;
    } else {
        label.innerText = "Draft Mode";
        label.style.background = "var(--surface)";
        label.style.color = "var(--warning)";
        saveBtn.style.display = "inline-block";
        const skipBtn = document.getElementById("btn-skip-ai-weekly-review");
        if(skipBtn) skipBtn.style.display = "inline-block";
        actions.innerHTML = "";
    }
    
    let html = `
        <div style="display: flex; flex-direction: column; gap: 32px;">
            <div style="background: var(--bg); padding: 24px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Section 1 of 7 — Overview</div>
                <h3 style="margin: 0 0 16px 0;">Week ${data.weekNum} — ${data.startDate} to ${data.endDate}</h3>
                <div style="display: flex; gap: 24px; color: var(--text);">
                    <div><strong>Trading Days:</strong> ${data.daysWithTrades}</div>
                    <div><strong>Accounts Traded:</strong> ${data.accountSet.length > 0 ? data.accountSet.length : "None"}</div>
                    <div>
                        <strong>Sessions:</strong> 
                        NY: ${data.sessionCounts["New York"] || 0} | LON: ${data.sessionCounts["London"] || 0} | ASIA: ${data.sessionCounts["Asian"] || 0}
                    </div>
                </div>
            </div>
            
            <div>
                <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Section 2 of 7 — Performance Summary</div>
                <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px;">
                    <div class="card" style="padding: 16px;">
                        <div class="stat-label">Total Trades</div>
                        <div class="stat-value">${data.totalTrades}</div>
                    </div>
                    <div class="card" style="padding: 16px;">
                        <div class="stat-label">Win Rate</div>
                        <div class="stat-value">${data.winRate.toFixed(1)}%</div>
                    </div>
                    <div class="card" style="padding: 16px;">
                        <div class="stat-label">Total R</div>
                        <div class="stat-value" style="color: ${data.totalR >= 0 ? 'var(--success)' : 'var(--danger)'};">${data.totalR >= 0 ? '+' : ''}${data.totalR.toFixed(2)}R</div>
                    </div>
                    <div class="card" style="padding: 16px;">
                        <div class="stat-label">Total P&L</div>
                        <div class="stat-value" style="color: ${data.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)'};">${data.totalPnl >= 0 ? '+' : ''}$${data.totalPnl.toFixed(2)}</div>
                    </div>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border); color: var(--muted); font-size: 0.85rem;">
                            <th style="padding: 12px; text-align: left;">Day</th>
                            <th style="padding: 12px; text-align: left;">Trades</th>
                            <th style="padding: 12px; text-align: left;">W/L</th>
                            <th style="padding: 12px; text-align: left;">R</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.tableRows.map(r => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 12px;">${r.day}</td>
                                <td style="padding: 12px;">${r.trades}</td>
                                <td style="padding: 12px;">${r.wl}</td>
                                <td style="padding: 12px; color: ${r.r >= 0 ? 'var(--success)' : 'var(--danger)'};">${r.r >= 0 ? '+' : ''}${r.r}R</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
                
                <div style="display: flex; gap: 24px; font-size: 0.9rem;">
                   <div><strong style="color: var(--muted);">Best Trade:</strong> ${data.bestTrade ? `${data.bestTrade.pair} (${data.bestTrade.grade}) / +${parseFloat(data.bestTrade.r).toFixed(2)}R` : '-'}</div>
                   <div><strong style="color: var(--muted);">Worst Trade:</strong> ${data.worstTrade ? `${data.worstTrade.pair} (${data.worstTrade.grade}) / ${parseFloat(data.worstTrade.r).toFixed(2)}R` : '-'}</div>
                   <div><strong style="color: var(--muted);">Top Pair:</strong> ${data.mostTradedPair}</div>
                </div>
            </div>
            
            <div style="background: var(--bg); padding: 24px; border-radius: 8px; border: 1px solid var(--border);">
               <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">Section 3 of 7 — Execution & Discipline</div>
               
               <div style="display: flex; gap: 32px; flex-wrap: wrap;">
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Rule Adherence</div>
                       <div class="stat-value" style="color: ${data.ruleAdherencePct >= 80 ? 'var(--success)' : 'var(--warning)'}">${data.ruleAdherencePct.toFixed(0)}%</div>
                   </div>
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Avg Quality Score</div>
                       <div class="stat-value">${data.avgQuality.toFixed(1)} / 10</div>
                   </div>
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Daily Loss Hits</div>
                       <div class="stat-value" style="color: ${data.dailyLossHits > 0 ? 'var(--danger)' : 'var(--success)'}">${data.dailyLossHits}</div>
                   </div>
               </div>
               
               <div style="display: flex; gap: 32px; flex-wrap: wrap; margin-top: 24px;">
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Daily Plans Completed</div>
                       <div class="stat-value">${data.plansLogged} / ${data.expectedPlanDays}</div>
                   </div>
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Top Confluences Used</div>
                       <div class="stat-value" style="font-size: 1rem; white-space: normal;">${data.topConfluences.length > 0 ? data.topConfluences.join(" • ") : "-"}</div>
                   </div>
               </div>
               
               <div style="margin-top: 24px;">
                   <div class="stat-label" style="margin-bottom: 8px;">Grade Distribution</div>
                   <div style="display: flex; gap: 8px;">
                      <div style="background: var(--surface); padding: 4px 12px; border-radius: 4px; border-left: 3px solid var(--success);">A: ${data.gradeCounts['A'] || 0}</div>
                      <div style="background: var(--surface); padding: 4px 12px; border-radius: 4px; border-left: 3px solid var(--primary);">B: ${data.gradeCounts['B'] || 0}</div>
                      <div style="background: var(--surface); padding: 4px 12px; border-radius: 4px; border-left: 3px solid var(--warning);">C: ${data.gradeCounts['C'] || 0}</div>
                      <div style="background: var(--surface); padding: 4px 12px; border-radius: 4px; border-left: 3px solid var(--danger);">F: ${data.gradeCounts['F'] || 0}</div>
                   </div>
               </div>
               
               ${data.ruleViolations.length > 0 ? `
               <div style="margin-top: 24px;">
                   <div class="stat-label" style="margin-bottom: 8px;">Rule Violations</div>
                   <ul style="margin: 0; padding-left: 20px; color: var(--text); font-size: 0.9rem;">
                       ${data.ruleViolations.map(v => `<li style="margin-bottom: 4px;"><strong>${v.pair}</strong> (${v.date}): <em>${v.reason}</em></li>`).join("")}
                   </ul>
               </div>` : `<div style="margin-top: 24px; color: var(--success); font-size: 0.9rem;">No rule violations logged this week!</div>`}
            </div>

            <div>
               <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">Section 4 of 7 — Psychological Summary</div>
               <div style="display: flex; gap: 32px; flex-wrap: wrap;">
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Emotional Consistency</div>
                       <div class="stat-value" style="color: ${data.emotionalConsistency >= 80 ? 'var(--success)' : 'var(--warning)'}">${data.emotionalConsistency.toFixed(0)}%</div>
                   </div>
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Dominant Pre-Trade</div>
                       <div class="stat-value" style="font-size: 1.5rem;">${data.domPre}</div>
                   </div>
                   <div style="flex: 1; min-width: 200px;">
                       <div class="stat-label">Dominant During-Trade</div>
                       <div class="stat-value" style="font-size: 1.5rem;">${data.domDuring}</div>
                   </div>
               </div>
               
               <div style="margin-top: 24px;">
                   <div class="stat-label" style="margin-bottom: 8px;">Emotional Timeline</div>
                   <div style="display: flex; gap: 8px;">
                      ${data.emotionTimeline.map(e => `
                          <div style="background: var(--surface); padding: 8px 16px; border-radius: 4px; text-align: center; border-bottom: 2px solid ${getEmotionColor(e.emotion)};">
                              <div style="font-size: 0.75rem; color: var(--muted); margin-bottom: 4px;">${e.day}</div>
                              <div style="font-size: 0.85rem; font-weight: 500;">${e.emotion}</div>
                          </div>
                      `).join("")}
                   </div>
               </div>
            </div>
            
            <div style="margin-top: 16px; padding-top: 24px; border-top: 1px solid var(--border);">
               <div style="font-size: 0.85rem; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">Section 5 of 7 — Trader Assessment</div>
               
               ${!isEditable && data.manual ? `
                   <div style="display: grid; gap: 16px; background: rgba(255,255,255,0.02); padding: 24px; border-radius: 8px;">
                       <div><strong style="color: var(--muted);">Overall Rating:</strong> ${"⭐".repeat(data.manual.rating || 0)}</div>
                       <div><strong style="color: var(--muted);">What went well:</strong><p style="margin: 4px 0 0 0; line-height: 1.5;">${data.manual.wentWell}</p></div>
                       <div><strong style="color: var(--muted);">What needs improvement:</strong><p style="margin: 4px 0 0 0; line-height: 1.5;">${data.manual.wentWrong}</p></div>
                       <div><strong style="color: var(--muted);">Followed plan:</strong> ${data.manual.followedPlan}</div>
                       <div><strong style="color: var(--muted);">Mental State:</strong> ${data.manual.mentalState}</div>
                       <div><strong style="color: var(--muted);">Key Lesson:</strong><p style="margin: 4px 0 0 0; line-height: 1.5;">${data.manual.keyLesson}</p></div>
                   </div>
               ` : `
                   <div class="form-group" style="margin-bottom: 24px;">
                       <label>1. Overall Week Rating <span style="color: var(--danger);">●</span></label>
                       <select id="wr-rating" style="width: 150px;">
                           <option value="5" ${data.manual?.rating === 5 ? "selected" : ""}>⭐⭐⭐⭐⭐ (5)</option>
                           <option value="4" ${data.manual?.rating === 4 ? "selected" : ""}>⭐⭐⭐⭐ (4)</option>
                           <option value="3" ${data.manual?.rating === 3 || !data.manual ? "selected" : ""}>⭐⭐⭐ (3)</option>
                           <option value="2" ${data.manual?.rating === 2 ? "selected" : ""}>⭐⭐ (2)</option>
                           <option value="1" ${data.manual?.rating === 1 ? "selected" : ""}>⭐ (1)</option>
                       </select>
                   </div>
                   
                   <div class="form-group" style="margin-bottom: 24px;">
                       <label>2. What went well this week? <span style="color: var(--danger);">●</span></label>
                       <textarea id="wr-went-well" rows="3" placeholder="Be specific — which setups, decisions, or habits worked?" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text);">${data.manual?.wentWell || ""}</textarea>
                   </div>
                   
                   <div class="form-group" style="margin-bottom: 24px;">
                       <label>3. What went wrong or needs improvement? <span style="color: var(--danger);">●</span></label>
                       <textarea id="wr-went-wrong" rows="3" placeholder="Be honest — what mistakes, habits, or patterns cost you?" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text);">${data.manual?.wentWrong || ""}</textarea>
                   </div>
                   
                   <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                       <div class="form-group">
                           <label>4. Did you follow trading plan? <span style="color: var(--danger);">●</span></label>
                           <select id="wr-plan-followed">
                               <option value="Always" ${data.manual?.followedPlan === "Always" ? "selected" : ""}>Always</option>
                               <option value="Mostly" ${data.manual?.followedPlan === "Mostly" || !data.manual ? "selected" : ""}>Mostly</option>
                               <option value="Sometimes" ${data.manual?.followedPlan === "Sometimes" ? "selected" : ""}>Sometimes</option>
                               <option value="Rarely" ${data.manual?.followedPlan === "Rarely" ? "selected" : ""}>Rarely</option>
                           </select>
                       </div>
                       <div class="form-group">
                           <label>5. Mental state overall? <span style="color: var(--danger);">●</span></label>
                           <select id="wr-mental-state">
                               <option value="Excellent" ${data.manual?.mentalState === "Excellent" ? "selected" : ""}>Excellent</option>
                               <option value="Good" ${data.manual?.mentalState === "Good" || !data.manual ? "selected" : ""}>Good</option>
                               <option value="Neutral" ${data.manual?.mentalState === "Neutral" ? "selected" : ""}>Neutral</option>
                               <option value="Stressed" ${data.manual?.mentalState === "Stressed" ? "selected" : ""}>Stressed</option>
                               <option value="Burnt Out" ${data.manual?.mentalState === "Burnt Out" ? "selected" : ""}>Burnt Out</option>
                           </select>
                       </div>
                   </div>
                   
                   <div class="form-group" style="margin-bottom: 24px;">
                       <label>6. Key lesson learned this week <span style="color: var(--danger);">●</span></label>
                       <textarea id="wr-lesson" rows="2" placeholder="One thing you will carry into next week" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text);">${data.manual?.keyLesson || ""}</textarea>
                   </div>
               `}
            </div>
            
            <div style="margin-bottom: 24px;">
               <div style="font-size: 0.85rem; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">Section 6 of 7 — Next Week Intentions</div>
               
               ${!isEditable && data.manual ? `
                   <div style="display: grid; gap: 16px; background: rgba(255,255,255,0.02); padding: 24px; border-radius: 8px;">
                       <div><strong style="color: var(--muted);">Primary Focus:</strong> ${data.manual.nextFocus}</div>
                       <div><strong style="color: var(--muted);">Target R:</strong> +${data.manual.targetR}R</div>
                       <div><strong style="color: var(--muted);">Rule to Enforce:</strong><p style="margin: 4px 0 0 0; line-height: 1.5;">${data.manual.ruleEnforce}</p></div>
                   </div>
               ` : `
                   <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                       <div class="form-group">
                           <label>1. Primary focus next week <span style="color: var(--danger);">●</span></label>
                           <select id="wr-next-focus">
                               <option value="Consistency" ${data.manual?.nextFocus === "Consistency" || !data.manual ? "selected" : ""}>Consistency</option>
                               <option value="Risk Management" ${data.manual?.nextFocus === "Risk Management" ? "selected" : ""}>Risk Management</option>
                               <option value="Patience" ${data.manual?.nextFocus === "Patience" ? "selected" : ""}>Patience</option>
                               <option value="Execution Quality" ${data.manual?.nextFocus === "Execution Quality" ? "selected" : ""}>Execution Quality</option>
                               <option value="Emotional Control" ${data.manual?.nextFocus === "Emotional Control" ? "selected" : ""}>Emotional Control</option>
                           </select>
                       </div>
                       <div class="form-group">
                           <label>2. Weekly R Target</label>
                           <input type="number" id="wr-target-r" step="0.1" value="${data.manual?.targetR || "5.0"}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text);" />
                       </div>
                   </div>
                   
                   <div class="form-group" style="margin-bottom: 24px;">
                       <label>3. One rule to enforce strictly <span style="color: var(--danger);">●</span></label>
                       <textarea id="wr-rule" rows="2" placeholder="e.g. No trading after 2 consecutive losses" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text);">${data.manual?.ruleEnforce || ""}</textarea>
                   </div>
               `}
            </div>

            <div style="background: rgba(168, 85, 247, 0.05); padding: 24px; border-radius: 8px; border: 1px solid rgba(168, 85, 247, 0.3);">
               <div style="font-size: 0.85rem; color: #a855f7; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">Section 7 of 7 — AI Weekly Report</div>
               <div id="wr-ai-container" style="color: var(--text); line-height: 1.6; font-size: 0.95rem;">
                   ${data.aiSummary ? data.aiSummary : `<span style="color: var(--muted); font-style: italic;">Submit your review to generate the AI report</span>`}
               </div>
            </div>

        </div>
    `;
    
    container.innerHTML = html;
    if(window.lucide) window.lucide.createIcons();
};

function getEmotionColor(e) {
    if(["Calm", "Confident", "Disciplined", "Patient", "Focused"].includes(e)) return "var(--success)";
    if(["Overconfident", "Tilted", "Revenge", "Fearful", "FOMO", "Stressed", "Frustrated"].includes(e)) return "var(--danger)";
    if(["None", "-"].includes(e)) return "var(--border)";
    return "var(--warning)";
}

window.saveWeeklyReview = async function(forceSkipAI = false) {
    const data = window.currentReviewData;
    if (!data) return;
    
    const wentWell = document.getElementById("wr-went-well").value.trim();
    const wentWrong = document.getElementById("wr-went-wrong").value.trim();
    const lesson = document.getElementById("wr-lesson").value.trim();
    const rule = document.getElementById("wr-rule").value.trim();
    
    if (wentWell.length < 10 || wentWrong.length < 10 || lesson.length < 10 || rule.length < 5) {
        alert("Please complete all required text fields with sufficient detail (min 10 chars).");
        return;
    }
    
    data.manual = {
        rating: parseInt(document.getElementById("wr-rating").value),
        wentWell: wentWell,
        wentWrong: wentWrong,
        followedPlan: document.getElementById("wr-plan-followed").value,
        mentalState: document.getElementById("wr-mental-state").value,
        keyLesson: lesson,
        nextFocus: document.getElementById("wr-next-focus").value,
        targetR: parseFloat(document.getElementById("wr-target-r").value) || 0,
        ruleEnforce: rule
    };
    
    const saveBtn = document.getElementById("btn-save-weekly-review");
    const skipBtn = document.getElementById("btn-skip-ai-weekly-review");
    saveBtn.innerText = "Processing...";
    saveBtn.disabled = true;
    if(skipBtn) skipBtn.disabled = true;
    
    // Force skip if parameter is true
    const skipAI = forceSkipAI;
    
    if (!skipAI) {
        saveBtn.innerText = "Generating AI Report...";
        try {
            await generateWeeklyReviewAI(data);
        } catch(e) {
            console.error("AI Generation failed inline", e);
        }
    } else {
        data.aiSummary = `<div style="color: var(--muted); font-style: italic;">AI analysis was skipped manually to save cost.</div>`;
    }
    
    let exists = Store.weeklyReviews.findIndex(r => r.key === data.key);
    if (exists > -1) Store.weeklyReviews[exists] = data;
    else Store.weeklyReviews.unshift(data);
    
    Store.save();
    window.currentReviewIsHistorical = true;
    window.currentReviewEditable = false;
    
    renderWeeklyReviewModal(data, true, false);
    renderWeeklyReviewHistory();
    checkWeeklyReviewTrigger();
};

window.generateWeeklyReviewAI = async function(reviewData) {
    if (!window.ENV_GEMINI_API_KEY) {
        reviewData.aiSummary = `<div style="text-align: center; color: var(--muted);"><i data-lucide="key" style="margin-bottom: 8px;"></i><br/>Add your Gemini API key in Settings to unlock the AI weekly report.</div>`;
        return;
    }
    
    const { GoogleGenAI } = await import("https://esm.run/@google/genai");
    const ai = new GoogleGenAI({ apiKey: window.ENV_GEMINI_API_KEY });
    
    const prompt = `
    Analyze this trader's weekly performance. Minimal, concise response to save tokens.
    Week: ${reviewData.weekNum}
    Total Trades: ${reviewData.totalTrades}
    Win Rate: ${reviewData.winRate.toFixed(1)}%
    Total R: ${reviewData.totalR.toFixed(2)}
    Rule Adherence: ${reviewData.ruleAdherencePct}%
    Emotions Pre: ${reviewData.domPre}, During: ${reviewData.domDuring}
    Rule Violations: ${reviewData.ruleViolations.length}
    Daily Loss Hits: ${reviewData.dailyLossHits}
    Trader's Assessment:
    - Went Well: ${reviewData.manual.wentWell}
    - Went Wrong: ${reviewData.manual.wentWrong}
    - Key Lesson: ${reviewData.manual.keyLesson}
    - Focus Next Week: ${reviewData.manual.nextFocus}
    - Rule to Enforce: ${reviewData.manual.ruleEnforce}
    
    Return a short, structured HTML report with NO markdown fences.
    Include these sections (use <h4> tags with style="color:var(--text); margin-bottom:8px; margin-top:24px;"):
    1. Verdict (1-2 sentences)
    2. Primary Edge
    3. Critical Risk
    4. Actionable Advice
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt,
            config: {
                systemInstruction: "You are an elite trading performance psychologist. Be direct, objective, and deeply insightful. Use clear HTML formatting."
            }
        });
        reviewData.aiSummary = (response?.text || "").replace(/```html/g, '').replace(/```/g, '');
    } catch (e) {
        console.error("AI Error:", e);
        reviewData.aiSummary = `<span style="color:var(--danger)">AI generation failed. Please try again later or skip AI analysis. Error: ${e.message}</span>`;
    }
};

window.exportWeeklyReviewPDF = function() {
    if (!window.jspdf) {
        alert("PDF export not ready. Please wait a moment.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const content = document.getElementById("weekly-review-content").innerText;
    
    doc.setFontSize(16);
    doc.text("Quant OS Edge - Weekly Review", 14, 15);
    doc.setFontSize(10);
    
    const splitText = doc.splitTextToSize(content, 180);
    doc.text(splitText, 14, 25);
    
    doc.save(`QuantEdge_WeeklyReview_${window.currentReviewData.startDate}.pdf`);
};



window.openWeeklyReviewModal = async function(dateKey = null) {
    let weekInfo;
    if (dateKey) {
        const parts = dateKey.split("-");
        weekInfo = getLocalWeekBoundaries(new Date(parts[0], parts[1]-1, parts[2]));
    } else {
        weekInfo = getLocalWeekBoundaries();
    }
    
    let isHistorical = false;
    let reviewData = Store.weeklyReviews.find(r => r.key === weekInfo.key);
    
    const now = new Date();
    let isEditable = false;
    
    if (reviewData) {
        // Exists. Check if it's editable (within 48 hours of timestamp)
        const ageHours = (now.getTime() - reviewData.timestamp) / 3600000;
        if (ageHours <= 48) {
            isEditable = true;
        } else {
            isHistorical = true;
        }
    } else {
        // Generate new
        isEditable = true;
        reviewData = await generateWeeklyReviewData(weekInfo);
    }
    
    window.currentReviewData = reviewData;
    window.currentReviewIsHistorical = isHistorical;
    window.currentReviewEditable = isEditable;
    
    await renderWeeklyReviewModal(reviewData, isHistorical, isEditable);
    window.openModal('modal-weekly-review');
};

async function generateWeeklyReviewData(weekInfo) {
    const { monday, sunday, weekNum, key } = weekInfo;
    
    let weekTrades = Store.trades.filter(t => {
        let td = new Date(t.date);
        return td >= monday && td <= sunday;
    });
    
    let totalR = 0, totalPnl = 0, wins = 0, losses = 0;
    let bestTradeR = -999, worstTradeR = 999;
    let bestTrade = null, worstTrade = null;
    let accountSet = new Set();
    let sessionCounts = { "Asian": 0, "London": 0, "New York": 0 };
    let pairCounts = {};
    let dailyLossHits = 0;
    let dayMap = new Map();
    let qualitySum = 0, qualityCount = 0;
    let ruleFollowed = 0, ruleTotal = 0;
    let gradeCounts = { "A": 0, "B": 0, "C": 0, "F": 0 };
    let ruleViolations = [];
    let confluenceCounts = {};
    let preEmotionCounts = {}, duringEmotionCounts = {};
    let positiveEmotions = ["Calm", "Confident", "Disciplined", "Patient", "Focused"];
    let positiveEmotionTrades = 0;
    let emotionMapByDay = new Map();
    let postReflections = [];
    
    let lastR = 0;
    for (let t of weekTrades) {
        let r = parseFloat(t.r) || 0;
        let pnl = parseFloat(t.pnlAmount) || 0;
        totalR += r;
        totalPnl += pnl;
        
        if (r > bestTradeR) { bestTradeR = r; bestTrade = t; }
        if (r < worstTradeR) { worstTradeR = r; worstTrade = t; }
        if (r > 0) wins++; else if (r <= 0 && t.result === "Loss") losses++;
        
        if (t.asset) {
            pairCounts[t.asset] = (pairCounts[t.asset] || 0) + 1;
        }
        if (t.session) {
            sessionCounts[t.session] = (sessionCounts[t.session] || 0) + 1;
        }
        if (t.accountId) accountSet.add(t.accountId);
        
        let dStr = new Date(t.date).toLocaleDateString('en-US', {weekday: 'long'});
        if (!dayMap.has(dStr)) dayMap.set(dStr, { trades: 0, wins: 0, losses: 0, r: 0, pnl: 0 });
        let dStats = dayMap.get(dStr);
        dStats.trades++;
        if (r > 0) dStats.wins++; else if(t.result === "Loss") dStats.losses++;
        dStats.r += r;
        dStats.pnl += pnl;
        
        if (t.qualityScore) {
            qualitySum += parseInt(t.qualityScore);
            qualityCount++;
        }
        if (t.ruleAdherence) {
            ruleTotal++;
            if (t.ruleAdherence === "Yes") ruleFollowed++;
            else {
                ruleViolations.push({ date: t.date, pair: t.asset, reason: t.ruleDeviation || "No reason given" });
            }
        }
        if (t.tradeGrade) {
            gradeCounts[t.tradeGrade] = (gradeCounts[t.tradeGrade] || 0) + 1;
        }
        if (t.confluences) {
            t.confluences.forEach(c => {
                confluenceCounts[c] = (confluenceCounts[c] || 0) + 1;
            });
        }
        
        if (t.preEmotion) {
            preEmotionCounts[t.preEmotion] = (preEmotionCounts[t.preEmotion] || 0) + 1;
            if (!emotionMapByDay.has(dStr)) emotionMapByDay.set(dStr, []);
            emotionMapByDay.get(dStr).push(t.preEmotion);
        }
        if (t.duringEmotion) {
            duringEmotionCounts[t.duringEmotion] = (duringEmotionCounts[t.duringEmotion] || 0) + 1;
            if (positiveEmotions.includes(t.preEmotion) && positiveEmotions.includes(t.duringEmotion)) {
                positiveEmotionTrades++;
            }
        }
        if (t.postNotes && t.postNotes.trim().length > 5) {
            postReflections.push({ date: t.date, pair: t.asset, note: t.postNotes });
        }
    }
    
    let daysWithTrades = dayMap.size;
    
    // Per account stats
    let accountStats = {};
    for (let acc of accountSet) {
        let accTrades = weekTrades.filter(t => t.accountId === acc);
        let aR = 0, aPnl = 0, aWins = 0, aLosses = 0;
        accTrades.forEach(t => { 
            aR += parseFloat(t.r) || 0; 
            aPnl += parseFloat(t.pnlAmount) || 0; 
            if(parseFloat(t.r)>0) aWins++;
            else if(t.result === "Loss") aLosses++;
        });
        
        let accountObj = Store.accounts.find(a => a.id === acc);
        let name = accountObj ? accountObj.name : "Unknown";
        
        accountStats[acc] = { name, trades: accTrades.length, r: aR, pnl: aPnl, wins: aWins, losses: aLosses };
    }
    
    let bestDay = { r: -999, name: "-" }, worstDay = { r: 999, name: "-" };
    let tableRows = [];
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].forEach(day => {
        if (dayMap.has(day)) {
            let d = dayMap.get(day);
            tableRows.push({ day, trades: d.trades, wl: `${d.wins}/${d.losses}`, r: d.r.toFixed(2), pnl: d.pnl.toFixed(2) });
            if (d.r > bestDay.r) { bestDay.r = d.r; bestDay.name = day; }
            if (d.r < worstDay.r) { worstDay.r = d.r; worstDay.name = day; }
            if (d.r <= -(Store.settings.dailyLossLimitR || 3)) dailyLossHits++;
        }
    });
    if (dayMap.size === 0) { bestDay.r = 0; worstDay.r = 0; }
    
    let mostTradedPair = Object.keys(pairCounts).sort((a,b) => pairCounts[b] - pairCounts[a])[0] || "-";
    let mostUsedSession = Object.keys(sessionCounts).sort((a,b) => sessionCounts[b] - sessionCounts[a])[0] || "-";
    let topConfluences = Object.keys(confluenceCounts).sort((a,b) => confluenceCounts[b] - confluenceCounts[a]).slice(0,3);
    
    let domPre = Object.keys(preEmotionCounts).sort((a,b) => preEmotionCounts[b] - preEmotionCounts[a])[0] || "-";
    let domDuring = Object.keys(duringEmotionCounts).sort((a,b) => duringEmotionCounts[b] - duringEmotionCounts[a])[0] || "-";
    
    // Daily Plans completed
    let plansLogged = 0;
    let expectedPlanDays = daysWithTrades; 
    let allKeys = Object.keys(Store.planner);
    for (let k of allKeys) {
        let pDateStr = k.split("_")[1];
        if(!pDateStr) continue;
        let pD = new Date(pDateStr);
        if (pD >= monday && pD <= sunday && k.startsWith("Daily_")) plansLogged++;
    }
    
    let emotionTimeline = [];
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].forEach(day => {
        let ems = emotionMapByDay.get(day);
        if (ems && ems.length > 0) {
            let dDom = ems.sort((a,b) => ems.filter(v => v===a).length - ems.filter(v => v===b).length).pop();
            emotionTimeline.push({ day: day.substring(0,3), emotion: dDom });
        } else {
            emotionTimeline.push({ day: day.substring(0,3), emotion: "None" });
        }
    });
    
    return {
        key,
        weekNum,
        startDate: monday.toISOString().split("T")[0],
        endDate: sunday.toISOString().split("T")[0],
        timestamp: new Date().getTime(),
        
        daysWithTrades,
        sessionCounts,
        accountSet: Array.from(accountSet),
        
        totalTrades: weekTrades.length,
        winRate: weekTrades.length > 0 ? (wins / (wins+losses) * 100) : 0,
        totalR,
        totalPnl,
        bestDay,
        worstDay,
        avgRPerDay: daysWithTrades > 0 ? (totalR / daysWithTrades) : 0,
        accountStats,
        tableRows,
        bestTrade: bestTrade ? { pair: bestTrade.asset, r: bestTrade.r, grade: bestTrade.tradeGrade } : null,
        worstTrade: worstTrade ? { pair: worstTrade.asset, r: worstTrade.r, grade: worstTrade.tradeGrade } : null,
        mostTradedPair,
        mostUsedSession,
        
        avgQuality: qualityCount > 0 ? (qualitySum / qualityCount) : 0,
        ruleAdherencePct: ruleTotal > 0 ? (ruleFollowed / ruleTotal * 100) : 0,
        gradeCounts,
        ruleViolations,
        topConfluences,
        dailyLossHits,
        plansLogged,
        expectedPlanDays,
        
        domPre,
        domDuring,
        emotionalConsistency: weekTrades.length > 0 ? (positiveEmotionTrades / weekTrades.length * 100) : 0,
        emotionTimeline,
        postReflections,
        
        manual: null,
        aiSummary: null
    };
}
