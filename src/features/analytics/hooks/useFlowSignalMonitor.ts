import { useEffect, useRef } from 'react'

function playFlowSignalTone(audioContext: AudioContext) {
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  const startAt = audioContext.currentTime

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(784, startAt)
  oscillator.frequency.exponentialRampToValueAtTime(988, startAt + 0.16)

  gainNode.gain.setValueAtTime(0.0001, startAt)
  gainNode.gain.exponentialRampToValueAtTime(0.045, startAt + 0.03)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22)

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  oscillator.start(startAt)
  oscillator.stop(startAt + 0.24)
}

export function useFlowSignalMonitor(activeSymbols: string[], enabled: boolean) {
  const previousCountRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioReadyRef = useRef(false)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return
    }

    const unlockAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext()
      }

      void audioContextRef.current.resume().then(() => {
        audioReadyRef.current = true
      }).catch(() => {
        audioReadyRef.current = false
      })
    }

    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [enabled])

  useEffect(() => {
    const nextCount = activeSymbols.length
    const previousCount = previousCountRef.current

    if (enabled && previousCount !== null && nextCount > previousCount && audioReadyRef.current && audioContextRef.current) {
      playFlowSignalTone(audioContextRef.current)
    }

    previousCountRef.current = nextCount
  }, [activeSymbols, enabled])

  useEffect(() => {
    if (enabled) {
      return
    }

    audioReadyRef.current = false
  }, [enabled])

  useEffect(() => {
    return () => {
      if (!audioContextRef.current) {
        return
      }

      void audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }, [])

  return {
    activeCount: activeSymbols.length,
  }
}
