// HEXGRID - Audio System (Web Audio API)

export const AudioSystem = {
    ctx: null,
    masterGain: null,
    enabled: true,

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();

            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            console.warn('Web Audio API not available');
            this.enabled = false;
        }
    },

    // Play a tone
    playTone(frequency, duration, type = 'sine', volume = 0.5) {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(volume * 0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    // Countdown beep
    playCountdown(number) {
        if (!this.enabled || !this.ctx) return;

        const freq = number === 0 ? 880 : 440;
        const duration = number === 0 ? 0.4 : 0.15;

        this.playTone(freq, duration, 'square', 0.4);

        if (number === 0) {
            // Extra fanfare for go
            setTimeout(() => this.playTone(1100, 0.15, 'square', 0.3), 100);
            setTimeout(() => this.playTone(1320, 0.2, 'square', 0.35), 200);
        }
    },

    // Game start sound
    playGameStart() {
        if (!this.enabled || !this.ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 0.15, 'square', 0.35);
            }, i * 80);
        });
    },

    // Move/direction change
    playMove() {
        if (!this.enabled || !this.ctx) return;
        this.playTone(220, 0.05, 'sine', 0.2);
    },

    // Territory claimed
    playClaim(tileCount) {
        if (!this.enabled || !this.ctx) return;

        const baseFreq = 400;
        const freqBoost = Math.min(tileCount * 20, 400);

        this.playTone(baseFreq + freqBoost, 0.2, 'sine', 0.4);
        setTimeout(() => {
            this.playTone(baseFreq + freqBoost + 200, 0.15, 'sine', 0.3);
        }, 100);
    },

    // Power-up collected
    playPowerUp(type) {
        if (!this.enabled || !this.ctx) return;

        switch (type) {
            case 'gem':
                this.playTone(800, 0.1, 'sine', 0.3);
                setTimeout(() => this.playTone(1000, 0.1, 'sine', 0.25), 50);
                break;
            case 'crown':
                // Majestic chord
                this.playTone(523.25, 0.3, 'sine', 0.3);
                this.playTone(659.25, 0.3, 'sine', 0.25);
                this.playTone(783.99, 0.3, 'sine', 0.25);
                setTimeout(() => this.playTone(1046.50, 0.4, 'sine', 0.35), 150);
                break;
            case 'multiplier':
                this.playTone(600, 0.1, 'square', 0.3);
                setTimeout(() => this.playTone(900, 0.15, 'square', 0.25), 80);
                break;
            case 'speed':
                // Ascending fast
                for (let i = 0; i < 4; i++) {
                    setTimeout(() => {
                        this.playTone(400 + i * 150, 0.08, 'sawtooth', 0.25);
                    }, i * 40);
                }
                break;
            case 'freeze':
                // Crystalline sound
                this.playTone(1200, 0.2, 'sine', 0.3);
                this.playTone(1500, 0.2, 'sine', 0.2);
                setTimeout(() => this.playTone(1800, 0.3, 'sine', 0.15), 100);
                break;
        }
    },

    // Player eliminated
    playElimination(isLocalPlayer) {
        if (!this.enabled || !this.ctx) return;

        if (isLocalPlayer) {
            // Dramatic death sound
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    this.playTone(200 - i * 30, 0.2, 'sawtooth', 0.3 - i * 0.05);
                }, i * 50);
            }
        } else {
            // Quick elimination ping
            this.playTone(300, 0.1, 'square', 0.2);
            setTimeout(() => this.playTone(150, 0.15, 'square', 0.15), 80);
        }
    },

    // Round over
    playRoundOver(won) {
        if (!this.enabled || !this.ctx) return;

        if (won) {
            // Victory fanfare
            const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51];
            melody.forEach((freq, i) => {
                setTimeout(() => {
                    this.playTone(freq, 0.2, 'square', 0.35);
                }, i * 120);
            });
        } else {
            // Gentle end
            this.playTone(400, 0.3, 'sine', 0.3);
            setTimeout(() => this.playTone(350, 0.3, 'sine', 0.25), 200);
            setTimeout(() => this.playTone(300, 0.4, 'sine', 0.2), 400);
        }
    },

    // Freeze effect on player
    playFrozen() {
        if (!this.enabled || !this.ctx) return;

        this.playTone(100, 0.3, 'sine', 0.2);
        this.playTone(150, 0.3, 'sine', 0.15);
    }
};
