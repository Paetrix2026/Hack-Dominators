import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Sprout, Link2, ShieldCheck, Cpu, ScanLine, ArrowRight } from "lucide-react";
import { Particles } from "@/components/Particles";

const FloatingIcon = ({ Icon, delay, initialPos, animateTo, size = "w-12 h-12" }: any) => (
  <motion.div
    initial={{ opacity: 0, x: initialPos.x, y: initialPos.y, rotate: 0 }}
    animate={{ 
      opacity: [0, 0.3, 0.3, 0],
      x: animateTo.x,
      y: animateTo.y,
      rotate: [0, 180, 360]
    }}
    transition={{
      duration: 15,
      delay: delay,
      repeat: Infinity,
      ease: "linear"
    }}
    className="absolute pointer-events-none text-primary/30"
  >
    <Icon className={size} />
  </motion.div>
);

const textVariants = {
  hidden: { opacity: 0, y: 50, filter: "blur(10px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.05,
      duration: 0.8,
      ease: [0.2, 0.65, 0.3, 0.9],
    },
  }),
};

const Intro = () => {
  const navigate = useNavigate();

  // Mouse spotlight effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 100, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 100, damping: 25 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const titleWords = "AyurTrust".split("");
  const descWords = "The immutable ledger for Ayurvedic supply chains. Authenticity, verified from soil to shelf.".split(" ");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground flex flex-col items-center justify-center selection:bg-primary/30">
      {/* Dynamic Cursor Spotlight */}
      <motion.div
        className="pointer-events-none fixed top-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10"
        style={{
          x: springX,
          y: springY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      />

      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <Particles density={70} />
      
      {/* Background Glowing Orbs */}
      <motion.div 
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
          rotate: [0, 90, 0]
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-primary/10 via-secondary/5 to-accent/10 blur-[120px]" 
      />

      {/* Floating Elements (Blockchain + AI + Agriculture theme) */}
      <FloatingIcon Icon={ShieldCheck} delay={0} initialPos={{ x: '-40vw', y: '40vh' }} animateTo={{ x: '40vw', y: '-40vh' }} size="w-16 h-16" />
      <FloatingIcon Icon={Link2} delay={5} initialPos={{ x: '30vw', y: '40vh' }} animateTo={{ x: '-30vw', y: '-30vh' }} size="w-20 h-20" />
      <FloatingIcon Icon={Cpu} delay={2} initialPos={{ x: '-30vw', y: '-40vh' }} animateTo={{ x: '40vw', y: '30vh' }} size="w-12 h-12" />
      <FloatingIcon Icon={ScanLine} delay={8} initialPos={{ x: '40vw', y: '-30vh' }} animateTo={{ x: '-40vw', y: '20vh' }} size="w-24 h-24" />
      <FloatingIcon Icon={Sprout} delay={11} initialPos={{ x: '0vw', y: '50vh' }} animateTo={{ x: '0vw', y: '-50vh' }} size="w-14 h-14" />

      <div className="z-10 flex flex-col items-center justify-center text-center px-4 max-w-4xl">
        
        {/* Main Logo Animation */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.2 }}
          className="mb-10 relative group perspective-1000"
        >
          {/* Rotating dashed circles */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-6 border-2 border-primary/20 border-dashed rounded-full"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-10 border border-secondary/20 border-dotted rounded-full"
          />
          
          <div className="absolute inset-0 blur-2xl bg-primary/40 rounded-full group-hover:bg-primary/60 transition-colors duration-500 animate-pulse" />
          
          {/* 3D Floating Icon Container */}
          <motion.div 
            whileHover={{ scale: 1.1, rotateX: 10, rotateY: 10 }}
            className="relative bg-background/80 backdrop-blur-md border border-primary/40 p-7 rounded-full shadow-[0_0_50px_hsl(var(--primary)/0.4)] overflow-hidden cursor-pointer"
          >
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [0, -5, 5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sprout className="w-20 h-20 text-primary drop-shadow-[0_0_20px_hsl(var(--primary))]" />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Title Staggered Letter Animation */}
        <h1 className="text-7xl md:text-9xl font-extrabold tracking-tighter mb-6 flex overflow-hidden p-2">
          {titleWords.map((letter, i) => (
            <motion.span
              key={i}
              custom={i}
              variants={textVariants}
              initial="hidden"
              animate="visible"
              className={i >= 4 ? "text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent drop-shadow-sm" : "text-foreground drop-shadow-sm"}
            >
              {letter}
            </motion.span>
          ))}
        </h1>

        {/* Subtitle Staggered Word Animation */}
        <motion.div 
          className="text-xl md:text-3xl text-muted-foreground max-w-3xl font-light mb-16 flex flex-wrap justify-center gap-x-2 gap-y-2 leading-relaxed"
        >
          {descWords.map((word, i) => (
            <motion.span
              key={i}
              custom={i + titleWords.length} // delay offset after title
              variants={textVariants}
              initial="hidden"
              animate="visible"
              className="inline-block"
            >
              {word}
            </motion.span>
          ))}
        </motion.div>

        {/* CRAZY Button Animation */}
        <motion.div
          initial={{ scale: 0, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 1.5 }}
          className="relative group"
        >
          {/* Animated spinning background border */}
          <div className="absolute -inset-1 rounded-full opacity-70 group-hover:opacity-100 blur-md transition duration-500 overflow-hidden">
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
               className="w-[200%] h-[200%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0_340deg,hsl(var(--primary))_360deg)]"
             />
             <motion.div 
               animate={{ rotate: -360 }}
               transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
               className="w-[200%] h-[200%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0_340deg,hsl(var(--secondary))_360deg)] opacity-50"
             />
          </div>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/home')}
            className="relative flex items-center gap-3 bg-background/95 backdrop-blur-xl border border-primary/30 px-12 py-5 rounded-full font-bold text-xl text-primary overflow-hidden shadow-[0_0_40px_hsl(var(--primary)/0.3)] group-hover:shadow-[0_0_60px_hsl(var(--primary)/0.6)] transition-shadow duration-500"
          >
            {/* Hover ripple fill effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out rounded-full" />
            
            <span className="relative z-10 tracking-widest uppercase text-sm font-black">Initialize Portal</span>
            
            {/* Arrow animation */}
            <motion.div 
              className="relative z-10 bg-primary/20 p-2 rounded-full"
              animate={{ x: [0, 6, 0] }} 
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
              <ArrowRight className="w-5 h-5" />
            </motion.div>
          </motion.button>
        </motion.div>

      </div>
    </div>
  );
};

export default Intro;
