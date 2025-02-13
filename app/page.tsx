"use client"

import { useRef, useEffect, useState } from "react"
import { useChat } from "ai/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Wifi } from "lucide-react"
import type React from "react"

const MatrixCode = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    const fontSize = 14
    const columns = Math.floor(canvas.width / fontSize)

    const drops: number[] = new Array(columns).fill(0).map(() => Math.floor((Math.random() * canvas.height) / fontSize))

    const matrixChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = "rgba(0, 255, 0, 0.1)"
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = matrixChars[Math.floor(Math.random() * matrixChars.length)]

        const x = i * fontSize
        const y = drops[i] * fontSize

        const opacity = Math.random() * 0.2 + 0.1
        ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`

        ctx.fillText(char, x, y)

        if (y > canvas.height) {
          drops[i] = 0
        } else {
          drops[i]++
        }
      }

      requestAnimationFrame(draw)
    }

    requestAnimationFrame(draw)

    return () => {
      window.removeEventListener("resize", resizeCanvas)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
}

export default function MatrixControlCenter() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()
  const [isTyping, setIsTyping] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Connected")
  const [systemMessage, setSystemMessage] = useState("")

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsTyping(true)
    handleSubmit(e).finally(() => setIsTyping(false))
  }

  useEffect(() => {
    const statusInterval = setInterval(() => {
      setConnectionStatus((prev) => (prev === "Connected" ? "Secure" : "Connected"))
    }, 5000)

    const messageInterval = setInterval(() => {
      const messages = [
        "Monitoring the Matrix...",
        "Scanning for anomalies...",
        "Updating protocols...",
        "Synchronizing data...",
        "Optimizing network...",
      ]
      setSystemMessage(messages[Math.floor(Math.random() * messages.length)])
    }, 10000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(messageInterval)
    }
  }, [])

  return (
    <div className="flex flex-col min-h-screen bg-black text-[#00FF00] font-matrix relative overflow-hidden">
      <MatrixCode />
      <div className="max-w-4xl w-full mx-auto flex flex-col flex-grow relative z-10">
        <header className="border-b border-[#00FF00] border-opacity-50 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-[#00FF00] animate-blink text-2xl">{">"}</span>
            <h1 className="text-2xl uppercase tracking-wider font-bold">Matrix Control Center</h1>
          </div>
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 animate-pulse" />
            <span className="text-sm transition-opacity duration-500">{connectionStatus}</span>
          </div>
        </header>

        <main className="flex-grow flex flex-col p-4">
          <div className="flex-grow overflow-y-auto mb-4 scrollbar-thin scrollbar-thumb-[#00FF00] scrollbar-track-black">
            {messages.map((m, index) => (
              <div
                key={m.id}
                className={`mb-4 ${m.role === "user" ? "text-right" : "text-left"} animate-fadeIn`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <span
                  className={`inline-block p-2 ${
                    m.role === "user"
                      ? "bg-[#00FF00] bg-opacity-20 text-white"
                      : "bg-black border border-[#00FF00] text-[#00FF00]"
                  }`}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {isTyping && (
              <div className="text-left animate-fadeIn">
                <span className="inline-block p-2 bg-black border border-[#00FF00] text-[#00FF00]">
                  <span className="animate-ellipsis">Decrypting response</span>
                </span>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-[#00FF00] border-opacity-50 pt-4">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Enter command..."
              className="flex-grow bg-black text-[#00FF00] border-[#00FF00] border-opacity-50 focus:ring-[#00FF00] focus:border-[#00FF00] placeholder-[#00FF00] placeholder-opacity-50 transition-all duration-300 ease-in-out focus:scale-[1.02]"
            />
            <Button
              type="submit"
              disabled={isTyping}
              className="bg-[#00FF00] bg-opacity-20 text-[#00FF00] border border-[#00FF00] border-opacity-50 hover:bg-opacity-30 px-6 transition-all duration-300 ease-in-out hover:scale-105 active:scale-95"
            >
              Execute
            </Button>
          </form>
        </main>

        <footer className="border-t border-[#00FF00] border-opacity-50 p-4 text-center text-sm">
          <span className="animate-pulse-slow">{systemMessage}</span>
        </footer>
      </div>
    </div>
  )
}

