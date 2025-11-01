import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface ModelSelectorProps {
  selectedModels: string[];
  onModelsChange: (models: string[]) => void;
  onPurchaseInsights: () => void;
}

const models = [
  { id: 'deepseek', label: 'DeepSeek', defaultChecked: true },
  { id: 'chatgpt', label: 'ChatGPT', defaultChecked: true },
  { id: 'groq', label: 'Groq', defaultChecked: true },
  { id: 'grok', label: 'xAI Grok', defaultChecked: true },
  { id: 'mock-vendor', label: 'Mock Vendor', defaultChecked: true },
];

export function ModelSelector({ selectedModels, onModelsChange, onPurchaseInsights }: ModelSelectorProps) {
  const handleToggle = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      onModelsChange(selectedModels.filter((m) => m !== modelId));
    } else {
      onModelsChange([...selectedModels, modelId]);
    }
  };

  const totalPrice = selectedModels.length * 4;
  const hasSelection = selectedModels.length > 0;

  return (
    <Card className="border-border bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Trading Models</CardTitle>
        <CardDescription>Select models to track (multi-select enabled)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {models.map((model) => (
            <div key={model.id} className="flex items-center space-x-2">
              <Checkbox
                id={model.id}
                checked={selectedModels.includes(model.id)}
                onCheckedChange={() => handleToggle(model.id)}
              />
              <Label
                htmlFor={model.id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {model.label}
              </Label>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border">
          <Button
            onClick={onPurchaseInsights}
            disabled={!hasSelection}
            className="w-full"
            variant="default"
          >
            Purchase Insights for {selectedModels.length} Model{selectedModels.length !== 1 ? 's' : ''} ({totalPrice} USDC)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
