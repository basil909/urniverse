'use client'

import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Variants,
} from 'framer-motion'

export type UniverseFact = {
  id: string
  title: string
  eyebrow: string
  fact: string
  detail: string
  visual: string
  stat?: string
}

type FactCardProps = {
  fact: UniverseFact | null
  visible: boolean
}

/* ============================================================
   CINEMATIC EASING
============================================================ */

const EASE = [0.22, 1, 0.36, 1] as const

/* ============================================================
   CONTAINER
============================================================ */

const containerVariants: Variants = {
  hidden: {
    opacity: 0,
  },

  visible: {
    opacity: 1,

    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
    },
  },

  exit: {
    opacity: 0,

    transition: {
      when: 'afterChildren',
      staggerChildren: 0.05,
      staggerDirection: -1,
      duration: 0.1,
    },
  },
}

/* ============================================================
   GENERAL TEXT
============================================================ */

const textVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 24,
    filter: 'blur(8px)',
  },

  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',

    transition: {
      duration: 1,
      ease: EASE,
    },
  },

  exit: {
    opacity: 0,
    y: -12,
    filter: 'blur(4px)',

    transition: {
      duration: 0.4,
      ease: EASE,
    },
  },
}

/* ============================================================
   TITLE
============================================================ */

const titleVariants: Variants = {
  hidden: {
    y: '105%',
    opacity: 0,
  },

  visible: {
    y: '0%',
    opacity: 1,

    transition: {
      duration: 1.1,
      ease: EASE,
    },
  },

  exit: {
    y: '-50%',
    opacity: 0,

    transition: {
      duration: 0.5,
      ease: EASE,
    },
  },
}

/* ============================================================
   STAT
============================================================ */

const statVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 10,
  },

  visible: {
    opacity: 1,
    scale: 1,
    y: 0,

    transition: {
      duration: 0.8,
      ease: EASE,
    },
  },

  exit: {
    opacity: 0,
    scale: 0.95,

    transition: {
      duration: 0.3,
    },
  },
}

/* ============================================================
   RULE
============================================================ */

const ruleVariants: Variants = {
  hidden: {
    scaleX: 0,
    opacity: 0,
  },

  visible: {
    scaleX: 1,
    opacity: 1,

    transition: {
      duration: 1.4,
      ease: EASE,
    },
  },

  exit: {
    scaleX: 0,
    opacity: 0,

    transition: {
      duration: 0.3,
    },
  },
}

/* ============================================================
   COMPONENT
============================================================ */

export default function FactCard({
  fact,
  visible,
}: FactCardProps) {
  return (
    <MotionConfig reducedMotion="user">
      {/* Decorative: every fact is also in the page's screen-reader text,
          so the caption no longer announces itself on each scroll step */}
      <div aria-hidden="true">
        <AnimatePresence mode="wait">
          {visible && fact && (
            <motion.article
              key={fact.id}
              className="fact-card"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* ==================================================
                  EYEBROW
              ================================================== */}

              <motion.div
                className="fact-eyebrow"
                variants={textVariants}
              >
                <span className="fact-eyebrow-index">
                  {fact.eyebrow}
                </span>
              </motion.div>

              {/* ==================================================
                  TITLE

                  The wrapper remains a normal div.
                  Variants propagate directly to the h3.
              ================================================== */}

              <div className="fact-title-mask">
                <motion.h3
                  className="fact-title"
                  variants={titleVariants}
                >
                  {fact.title}
                </motion.h3>
              </div>

              {/* ==================================================
                  STAT
              ================================================== */}

              {fact.stat && (
                <motion.div
                  className="fact-stat"
                  variants={statVariants}
                >
                  <span className="fact-stat-value">
                    {fact.stat}
                  </span>
                </motion.div>
              )}

              {/* ==================================================
                  MAIN FACT
              ================================================== */}

              <motion.p
                className="fact-body"
                variants={textVariants}
              >
                {fact.fact}
              </motion.p>

              {/* ==================================================
                  DETAIL
              ================================================== */}

              {fact.detail && (
                <motion.p
                  className="fact-detail"
                  variants={textVariants}
                >
                  {fact.detail}
                </motion.p>
              )}

              {/* ==================================================
                  EDITORIAL RULE
              ================================================== */}

              <motion.div
                className="fact-rule"
                variants={ruleVariants}
              />
            </motion.article>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}