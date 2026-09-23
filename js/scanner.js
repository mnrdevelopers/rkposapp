/**
 * RK FASHIONS — Barcode Scanner Service
 * Supports USB hardware keyboard scanners + Mobile/Webcam camera scanner with audio/haptic feedback.
 */

class ScannerService {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.scanCallback = null;
    this.usbBuffer = '';
    this.lastKeyTime = 0;
    this.audioCtx = null;
  }

  /**
   * Generates instant cashier POS beep feedback using the Web Audio API.
   * Works 100% offline without audio assets.
   */
  playBeep() {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.audioCtx = new AudioContext();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.audioCtx) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, this.audioCtx.currentTime); // High pitch retail beep A6
        gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.12);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }

    // Haptic vibration feedback on supported mobile devices
    if (navigator.vibrate) {
      navigator.vibrate(80);
    }
  }

  /**
   * Initializes USB hardware barcode scanner detection.
   * USB scanners send rapid keystrokes (< 50ms per key) followed by Enter.
   */
  initUsbScanner(callback) {
    this.scanCallback = callback;

    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing inside textareas or standard forms (unless it's the POS barcode input)
      const target = e.target;
      const isPosInput = target && target.id === 'pos-barcode-input';
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (isInput && !isPosInput) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastKeyTime;
      this.lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (this.usbBuffer.length >= 3) {
          e.preventDefault();
          const barcode = this.usbBuffer.trim();
          this.usbBuffer = '';
          this.triggerScan(barcode);
        } else if (isPosInput && target.value.trim().length >= 3) {
          e.preventDefault();
          const barcode = target.value.trim();
          target.value = '';
          this.triggerScan(barcode);
        }
        return;
      }

      // Filter non-printable keys
      if (e.key.length === 1) {
        if (timeDiff > 120 && !isPosInput) {
          // Reset buffer if delay is too long (human typing)
          this.usbBuffer = '';
        }
        this.usbBuffer += e.key;
      }
    });
  }

  triggerScan(barcode) {
    if (!barcode) return;
    this.playBeep();
    if (this.scanCallback) {
      this.scanCallback(barcode);
    }
  }

  /**
   * Starts Camera Barcode Scanner in target DOM element using Html5Qrcode.
   */
  async startCameraScanner(elementId, onSuccess, onError) {
    if (this.isScanning) {
      await this.stopCameraScanner();
    }

    if (!window.Html5Qrcode) {
      const msg = 'Camera barcode library not available.';
      console.error(msg);
      if (onError) onError(msg);
      return;
    }

    try {
      this.html5QrCode = new Html5Qrcode(elementId);
      this.isScanning = true;

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 160 },
        aspectRatio: 1.0,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      };

      await this.html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          this.playBeep();
          this.stopCameraScanner();
          if (onSuccess) onSuccess(decodedText);
        },
        (errorMessage) => {
          // Ignore frequent frame-read misses
        }
      );
    } catch (err) {
      this.isScanning = false;
      console.error('Camera scanner start error:', err);
      if (onError) onError(err);
    }
  }

  async stopCameraScanner() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
        await this.html5QrCode.clear();
      } catch (e) {
        console.warn('Camera stop error:', e);
      }
      this.isScanning = false;
      this.html5QrCode = null;
    }
  }
}

window.scannerService = new ScannerService();
