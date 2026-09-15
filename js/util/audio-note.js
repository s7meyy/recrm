// زرّ الملاحظة الصوتية (المرحلة ٢٦): يُركَّب في أي استمارة تسجيل تواصل.
//
// الواجهة عمدًا **بحالتين لا أكثر**: سجّل / أوقف. ثم يظهر المسجَّل بمشغّله وزرّ حذفه.
// وما لم تضغط «تسجيل التواصل» لا يُحفظ شيء في التخزين — التسجيل يبقى في الذاكرة حتى الحفظ،
// فإغلاق الاستمارة لا يترك ملفات يتيمة.

import { el, toast } from './dom.js';
import { recordingSupported, startRecording, storeAudio, formatSeconds, AUDIO_LIMITS } from '../data/audio.js';

/**
 * @returns {{ node, save: (entityId) => Promise<{audioId, audioSeconds}|null>, discard: () => void } | null}
 *   `null` إن كان المتصفح لا يدعم التسجيل — فلا يُركَّب زرّ لا يعمل.
 */
export function audioNoteField() {
  if (!recordingSupported()) return null;

  let handle = null;
  let take = null; // { blob, seconds }
  let objectUrl = null;
  let ticker = null;

  const status = el('span', { class: 'muted small' });
  const player = el('audio', { controls: true, hidden: true, style: { maxWidth: '100%' } });
  const recordBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '🎤 ملاحظة صوتية' });
  const clearBtn = el('button', { type: 'button', class: 'icon-btn', text: '✕', title: 'احذف التسجيل', hidden: true });

  const revoke = () => { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } };

  const showTake = () => {
    revoke();
    objectUrl = URL.createObjectURL(take.blob);
    player.src = objectUrl;
    player.hidden = false;
    clearBtn.hidden = false;
    recordBtn.textContent = '🎤 سجّل من جديد';
    recordBtn.classList.remove('mic-on');
    status.textContent = `${formatSeconds(take.seconds)} — يُحفظ مع التواصل`;
  };

  const reset = () => {
    take = null;
    revoke();
    player.hidden = true;
    player.removeAttribute('src');
    clearBtn.hidden = true;
    recordBtn.textContent = '🎤 ملاحظة صوتية';
    recordBtn.classList.remove('mic-on');
    status.textContent = '';
  };

  clearBtn.addEventListener('click', reset);

  recordBtn.addEventListener('click', async () => {
    if (handle) { // إيقاف
      clearInterval(ticker);
      const h = handle;
      handle = null;
      recordBtn.disabled = true;
      try {
        take = await h.stop();
        showTake();
      } catch (err) {
        reset();
        toast(err.message || 'تعذر التسجيل', 'error');
      } finally {
        recordBtn.disabled = false;
      }
      return;
    }
    try {
      handle = await startRecording();
      recordBtn.textContent = '■ أوقف التسجيل';
      recordBtn.classList.add('mic-on');
      // العدّاد يجري ويقول الحدّ: تسجيلٌ يُقطع فجأة بلا إنذار يُفقد الثقة.
      ticker = setInterval(() => {
        const s = handle?.seconds ?? 0;
        status.textContent = `${formatSeconds(s)} / ${formatSeconds(AUDIO_LIMITS.maxSeconds)}`;
        if (s >= AUDIO_LIMITS.maxSeconds) recordBtn.click();
      }, 500);
    } catch (err) {
      handle = null;
      toast(err?.name === 'NotAllowedError' ? 'لم يُمنح إذن الميكروفون' : (err.message || 'تعذر بدء التسجيل'), 'error');
    }
  });

  return {
    node: el('div', { class: 'row audio-note' }, recordBtn, clearBtn, status, player),
    /** يحفظ التسجيل (إن وُجد) ويُعيد ما يُلحق بسجل التواصل. */
    async save(entityId) {
      if (!take) return null;
      const audioId = await storeAudio(take.blob, { entity: 'contact', entityId, seconds: take.seconds });
      return { audioId, audioSeconds: take.seconds };
    },
    /** يوقف أي تسجيل جارٍ وينظّف — يُستدعى عند إغلاق الاستمارة. */
    discard() {
      clearInterval(ticker);
      handle?.cancel();
      handle = null;
      reset();
    },
  };
}

/** مشغّل تسجيل محفوظ داخل سجل التواصل. */
export function audioPlayer(audioId, seconds = 0) {
  const node = el('span', { class: 'contact-audio' });
  const btn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: `▶ ${formatSeconds(seconds)}` });
  btn.addEventListener('click', async () => {
    const { getAudioUrl } = await import('../data/audio.js');
    const url = await getAudioUrl(audioId);
    if (!url) { toast('التسجيل غير موجود', 'error'); return; }
    node.replaceChildren(el('audio', { controls: true, autoplay: true, src: url, style: { maxWidth: '100%' } }));
  });
  node.append(btn);
  return node;
}
