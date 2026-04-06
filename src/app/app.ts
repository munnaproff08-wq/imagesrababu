import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GoogleGenAI } from '@google/genai';

interface HistoryItem {
  id: string;
  imagePreview: string;
  imageBase64: string;
  imageMimeType: string;
  prompt: string;
  timestamp: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  imagePreview = signal<string | null>(null);
  imageBase64 = signal<string | null>(null);
  imageMimeType = signal<string | null>(null);
  
  generatedPrompt = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  copied = signal<boolean>(false);

  // Customization
  promptPurpose = signal<string>('Recreate');
  selectedStyle = signal<string>('Any');
  detailLevel = signal<string>('High');
  focusElements = signal<string>('');

  // History
  history = signal<HistoryItem[]>([]);

  onPurposeChange(event: Event) {
    this.promptPurpose.set((event.target as HTMLSelectElement).value);
  }

  onStyleChange(event: Event) {
    this.selectedStyle.set((event.target as HTMLSelectElement).value);
  }

  onDetailChange(event: Event) {
    this.detailLevel.set((event.target as HTMLSelectElement).value);
  }

  onFocusChange(event: Event) {
    this.focusElements.set((event.target as HTMLInputElement).value);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.processFile(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.processFile(file);
    }
  }

  private processFile(file: File) {
    this.error.set(null);
    this.generatedPrompt.set(null);
    this.copied.set(false);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.imagePreview.set(result);
      
      // Extract base64 and mime type
      const base64Data = result.split(',')[1];
      this.imageBase64.set(base64Data);
      this.imageMimeType.set(file.type);
    };
    reader.onerror = () => {
      this.error.set('Failed to read file.');
    };
    reader.readAsDataURL(file);
  }

  async generatePrompt() {
    const base64 = this.imageBase64();
    const mimeType = this.imageMimeType();

    if (!base64 || !mimeType) {
      this.error.set('Please select an image first.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.generatedPrompt.set(null);
    this.copied.set(false);

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      
      let baseInstruction = '';
      if (this.promptPurpose() === 'FacePreservation') {
        baseInstruction = `Analyze the style, lighting, background, composition, clothing, and mood of this image. Write a highly detailed text prompt for an AI image generator. This prompt will be used by the user alongside a DIFFERENT photo of a person's face. The prompt MUST explicitly instruct the AI to preserve the facial identity and features of the person in the user's reference photo exactly, while placing them in the exact environment, style, pose, and lighting of the image you are analyzing. The prompt should start with "A portrait of the person in the reference image..."`;
      } else {
        baseInstruction = `Analyze this image and write a highly detailed, descriptive text prompt that could be used to recreate this image using an AI image generator.`;
      }

      const promptInstruction = `${baseInstruction}
Style: ${this.selectedStyle() !== 'Any' ? this.selectedStyle() : 'Match the original image style'}
Detail Level: ${this.detailLevel()}
Key elements to focus on: ${this.focusElements() ? this.focusElements() : 'subject, lighting, colors, composition, and mood'}
Do not include introductory or concluding remarks, just the prompt itself.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64,
                mimeType: mimeType,
              },
            },
            {
              text: promptInstruction,
            },
          ],
        },
      });

      if (response.text) {
        const newPrompt = response.text.trim();
        this.generatedPrompt.set(newPrompt);
        
        // Add to history
        this.history.update(h => [{
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          imagePreview: this.imagePreview()!,
          imageBase64: base64,
          imageMimeType: mimeType,
          prompt: newPrompt,
          timestamp: Date.now()
        }, ...h]);
      } else {
        this.error.set('Failed to generate prompt. Please try again.');
      }
    } catch (err: unknown) {
      console.error(err);
      this.error.set(err instanceof Error ? err.message : 'An error occurred while generating the prompt.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async copyToClipboard() {
    const prompt = this.generatedPrompt();
    if (!prompt) return;
    await this.copyText(prompt, () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  async copyHistoryItem(item: HistoryItem) {
    await this.copyText(item.prompt, () => {
      // Optional: Add a local toast or state for history item copy
    });
  }

  private async copyText(text: string, onSuccess: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      onSuccess();
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for iframe environments
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        onSuccess();
      } catch (fallbackErr) {
        console.error('Fallback copy failed', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  }

  loadHistoryItem(item: HistoryItem) {
    this.imagePreview.set(item.imagePreview);
    this.imageBase64.set(item.imageBase64);
    this.imageMimeType.set(item.imageMimeType);
    this.generatedPrompt.set(item.prompt);
    this.error.set(null);
    this.copied.set(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteHistoryItem(id: string) {
    this.history.update(h => h.filter(item => item.id !== id));
  }

  clearImage() {
    this.imagePreview.set(null);
    this.imageBase64.set(null);
    this.imageMimeType.set(null);
    this.generatedPrompt.set(null);
    this.error.set(null);
    this.copied.set(false);
  }
}
