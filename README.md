# Matrix Terminal

![Matrix Terminal](https://img.shields.io/badge/Matrix-Terminal-00FF00?style=for-the-badge) ![Next.js 14](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge)

A cutting-edge Matrix-themed chat interface that combines AI-powered conversation with seamless browser automation capabilities, delivering real-time visual feedback in an immersive terminal experience.

## 🌟 Features

- **Matrix-Themed Interface**
  - Real-time message display with Matrix visual effects
  - AMOLED Black background (#000000)
  - Matrix Green accents (#00FF00)
  - Pure White text (#FFFFFF)
  - Custom Geist font integration

- **Browser Automation**
  - Natural language command processing
  - Real-time visual feedback
  - Non-headless browser operation
  - Comprehensive action support (navigation, clicking, text input)
  - Enhanced error handling and recovery

- **AI Integration**
  - Groq API with LLaMA 3.3 70B model
  - Intelligent response system
  - Context-aware command processing
  - Real-time streaming responses

## 🚀 Getting Started

### Prerequisites

- Node.js (Latest LTS version recommended)
- npm (Node Package Manager)
- A modern web browser (Chromium-based recommended for automation features)
- Groq API key for AI functionality

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd matrix-terminal
```

2. Install dependencies:
```bash
npm install --legacy-peer-deps
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
GROQ_API_KEY=your_api_key_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see Matrix Terminal in action.

## 🔧 Project Structure

```
/
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   │   └── chat/      # Chat endpoint
│   ├── fonts/         # Custom fonts
│   └── globals.css    # Global styles
├── components/        # React components
│   └── ui/           # UI components
├── lib/              # Utility functions
└── docs/             # Documentation
```

## 💻 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test:e2e` - Run Playwright end-to-end tests

## 🎨 Customization

### Matrix Theme
The application uses a carefully crafted Matrix-inspired theme:
- Background: AMOLED Black (#000000)
- Accent: Matrix Green (#00FF00)
- Text: Pure White (#FFFFFF)
- Font: GeistMono for terminal-like appearance

### Components
Built with shadcn/ui components and Tailwind CSS for easy customization. Modify the theme in:
- `tailwind.config.ts` for color schemes
- `app/globals.css` for global styles
- `components/ui/` for component-specific styling

## 🔄 Browser Automation

Matrix Terminal provides powerful browser automation features:
- Natural language command processing
- Visual feedback for all actions
- Persistent browser sessions
- Comprehensive error recovery
- Real-time status updates

## 🛠 Technical Stack

- **Frontend**
  - Next.js 14+ with App Router
  - React 18+
  - TypeScript
  - Tailwind CSS
  - shadcn/ui components

- **Backend**
  - Next.js API routes
  - Groq API integration
  - Playwright for browser automation

- **Development Tools**
  - ESLint
  - PostCSS
  - TypeScript compiler
  - Playwright for testing

## 📦 Dependencies

### Core Dependencies
- next (14.2.16)
- react & react-dom (18+)
- openai (for Groq API)
- tailwindcss
- shadcn/ui components
- playwright (for browser automation)

### Development Dependencies
- TypeScript
- ESLint
- PostCSS
- Playwright for testing

## 🚀 Deployment

1. Build the application:
```bash
npm run build
```

2. Start the production server:
```bash
npm run start
```

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new). See the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚡ Performance Considerations

- Targets 60fps for smooth animations
- Optimized for responsive UI interactions
- Efficient state management
- Low-latency streaming responses
- Memory-efficient stream processing

## 🔒 Security Notes

- Secure API key management required
- Safe browser automation practices
- Input validation
- Sandboxed browser instances
- Proper error message sanitization

## 🆘 Support

For support, please open an issue in the GitHub repository or contact the maintainers.

---

Built with ❤️ using Next.js and the power of The Matrix
