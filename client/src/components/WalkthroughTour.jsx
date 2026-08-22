import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTour } from '../context/TourContext';
import { AiOutlineClose, AiOutlineArrowRight, AiOutlineArrowLeft } from 'react-icons/ai';

export default function WalkthroughTour() {
  const {
    isOpen,
    currentStepIndex,
    totalSteps,
    currentStep,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();

  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0, placement: 'bottom' });
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const targetEl =
      document.querySelector(currentStep.targetSelector) ||
      (currentStep.fallbackSelector ? document.querySelector(currentStep.fallbackSelector) : null);

    if (!targetEl) {
      setRect(null);
      return;
    }

    const b = targetEl.getBoundingClientRect();
    const padding = 8;
    const targetRect = {
      top: Math.max(0, b.top - padding),
      left: Math.max(0, b.left - padding),
      width: b.width + padding * 2,
      height: b.height + padding * 2,
      bottom: b.bottom + padding,
      right: b.right + padding,
    };

    setRect(targetRect);

    // Hitung posisi Tooltip Card
    const cardWidth = Math.min(360, window.innerWidth - 32);
    const cardHeight = 200; // estimasi tinggi card
    const margin = 14;

    let placement = currentStep.placement || 'bottom';
    let top = 0;
    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;

    // Boundary check horizontal
    if (left < 16) left = 16;
    if (left + cardWidth > window.innerWidth - 16) {
      left = window.innerWidth - 16 - cardWidth;
    }

    // Boundary check vertical
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    if (placement === 'bottom' && spaceBelow < cardHeight + margin && spaceAbove > spaceBelow) {
      placement = 'top';
    } else if (placement === 'top' && spaceAbove < cardHeight + margin && spaceBelow > spaceAbove) {
      placement = 'bottom';
    }

    if (placement === 'bottom') {
      top = targetRect.bottom + margin;
    } else {
      top = Math.max(16, targetRect.top - cardHeight - margin);
    }

    setCardPos({ top, left, placement });

    // Smooth scroll into view jika elemen berada di luar viewport
    if (b.top < 80 || b.bottom > window.innerHeight - 80) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isOpen, currentStep]);

  // Pantau perubahan step, resize window, dan scroll
  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false);
      setRect(null);
      return;
    }

    setIsVisible(true);

    // Initial update dan coba retry beberapa kali untuk render async
    updatePosition();
    const t1 = setTimeout(updatePosition, 150);
    const t2 = setTimeout(updatePosition, 450);
    const t3 = setTimeout(updatePosition, 850);

    const handleResizeOrScroll = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', handleResizeOrScroll, { passive: true });
    window.addEventListener('scroll', handleResizeOrScroll, { passive: true });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll);
    };
  }, [isOpen, currentStepIndex, updatePosition]);

  if (!isOpen || !isVisible || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return createPortal(
    <div className="fixed inset-0 z-[999999] pointer-events-auto select-none">
      {/* ── Spotlight Cutout & Dark Scrim ── */}
      {rect ? (
        <div
          className="fixed transition-all duration-300 ease-out rounded-xl border-2 border-gold-400/90 pointer-events-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(8, 26, 17, 0.82), 0 0 25px rgba(212, 175, 55, 0.45)',
          }}
        >
          {/* Spotlight Ping Glow */}
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-gold-500 border border-white"></span>
          </span>
        </div>
      ) : (
        /* Fallback dark overlay full screen saat elemen sedang dicari */
        <div className="fixed inset-0 bg-[#081a11]/80 backdrop-blur-xs transition-opacity duration-300" />
      )}

      {/* ── Floating Tooltip Popover Card ── */}
      <div
        ref={cardRef}
        className="fixed z-[1000000] w-[360px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#1e293b] border border-slate-700/80 shadow-[0_20px_50px_rgba(0,0,0,0.6)] text-white p-5 transition-all duration-300 ease-out"
        style={{
          top: cardPos.top,
          left: cardPos.left,
        }}
      >
        {/* Header Card */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 px-3 py-0.5 text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Langkah {currentStepIndex + 1} dari {totalSteps}
          </span>
          <button
            type="button"
            onClick={skipTour}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Tutup Panduan"
          >
            <AiOutlineClose className="text-sm" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <h4 className="text-base font-bold text-white tracking-tight leading-snug">
            {currentStep.title}
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            {currentStep.description}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-4 mt-3 border-t border-slate-700/70">
          <button
            type="button"
            onClick={skipTour}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors underline-offset-4 hover:underline"
          >
            Lewati Panduan
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={prevStep}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600/60 transition-all shadow-sm"
              >
                <AiOutlineArrowLeft className="text-xs" /> Kembali
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{isLastStep ? 'Selesai & Mulai 🚀' : 'Lanjut'}</span>
              {!isLastStep && <AiOutlineArrowRight className="text-xs" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
