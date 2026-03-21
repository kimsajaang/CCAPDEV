/**
 * Plexus Background Effect
 * A canvas-based particle system with connecting lines and glowing nodes.
 */

console.log("Plexus BG: Initializing...");
const canvas = document.getElementById('plexus-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
const particleCount = 40; // Lowered for better performance
const connectionDistance = 140;
const mouseRange = 250;

let width, height;
let mouse = { x: null, y: null };

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    console.log(`Plexus BG: Resized to ${width}x${height}`);
}

window.addEventListener('resize', resize);
window.addEventListener('mousemove', (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
});
window.addEventListener('mouseout', () => {
    mouse.x = null;
    mouse.y = null;
});

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.8; // Faster
        this.vy = (Math.random() - 0.5) * 0.8; // Faster
        this.size = Math.random() * 3 + 1; // Slightly larger
        this.isGlow = Math.random() > 0.75; // More glow nodes
        this.color = this.isGlow ? `rgba(251, 146, 60, ${Math.random() * 0.6 + 0.4})` : 'rgba(131, 165, 232, 0.6)';
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;

        if (mouse.x !== null && mouse.y !== null) {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < mouseRange) {
                this.x -= dx * 0.02;
                this.y -= dy * 0.02;
            }
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

function init() {
    resize();
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
    console.log(`Plexus BG: Created ${particles.length} particles`);
}

function animate() {
    // Solid background clear
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        for (let j = i + 1; j < particles.length; j++) {
            let dx = particles[i].x - particles[j].x;
            let dy = particles[i].y - particles[j].y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < connectionDistance) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, (1 - dist / connectionDistance) - 0.4)})`;
                ctx.lineWidth = 0.8;
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animate);
}

init();
animate();
console.log("Plexus BG: Animation loop started");
