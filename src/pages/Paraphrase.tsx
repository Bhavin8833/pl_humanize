import { useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { TextAreaBox } from "@/components/ui/TextAreaBox";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, RefreshCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { API_BASE_URL } from "@/config";

export default function Paraphrase() {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoCopy, setAutoCopy] = useState(false);

  const wordCount = (text: string) =>
    text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleParaphrase = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to paraphrase");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/paraphrase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to paraphrase");
      }

      const data = await response.json();

      if (data.warning) {
        toast.warning(data.warning);
      }

      setOutputText(data.text);
      toast.success("Text paraphrased successfully");

      if (autoCopy) {
        navigator.clipboard.writeText(data.text);
        toast.success("Auto-copied to clipboard!");
      }

    } catch (error) {
      console.error("Paraphrase error:", error);
      toast.error("Failed to paraphrase text. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = useCallback(() => {
    if (!outputText) {
      toast.error("No output to copy");
      return;
    }
    navigator.clipboard.writeText(outputText);
    toast.success("Copied to clipboard");
  }, [outputText]);

  const handleClear = () => {
    setInputText("");
    setOutputText("");
  };

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Paraphrase Tool
            </h1>
            <p className="text-muted-foreground">
              Rewrite your text with fresh vocabulary and improved clarity
            </p>
          </div>

          {/* Main Content */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Input Section */}
            <div>
              <TextAreaBox
                label="Original Text"
                value={inputText}
                onChange={setInputText}
                placeholder="Paste your text here to paraphrase..."
                wordCount={wordCount(inputText)}
                maxHeight="400px"
              />
            </div>

            {/* Output Section */}
            <div>
              <TextAreaBox
                label="Paraphrased Output"
                value={outputText}
                readOnly
                placeholder="Your paraphrased text will appear here..."
                wordCount={wordCount(outputText)}
                maxHeight="400px"
              />
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!outputText}
                >
                  <Copy className="h-4 w-4" />
                  Copy Output
                </Button>
                <Button variant="outline" size="sm" onClick={handleClear}>
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </Button>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-copy"
                checked={autoCopy}
                onCheckedChange={setAutoCopy}
              />
              <label
                htmlFor="auto-copy"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Auto Copy Result
              </label>
            </div>

            <Button
              variant="gradient"
              size="xl"
              onClick={handleParaphrase}
              disabled={isProcessing || !inputText.trim()}
              className="min-w-[200px]"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCcw className="h-5 w-5" />
              )}
              Paraphrase Text
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
