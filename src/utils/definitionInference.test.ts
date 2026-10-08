import { describe, expect, it } from 'vitest';
import { inferDefinitionFromSelection as infer } from './definitionInference';

describe('inferDefinitionFromSelection', () => {
  it('splits a whole definition into term and meaning', () => {
    expect(infer('Photosynthesis is the process by which plants make food from light.', ''))
      .toEqual({ term: 'Photosynthesis', meaning: 'Process by which plants make food from light' });
    expect(infer('Osmosis: the movement of water through a membrane', ''))
      .toEqual({ term: 'Osmosis', meaning: 'The movement of water through a membrane' });
    expect(infer('Opportunity cost refers to the value of the next best alternative given up', ''))
      .toEqual({ term: 'Opportunity cost', meaning: 'Value of the next best alternative given up' });
    expect(infer('GDP – the total value of goods produced in a year', ''))
      .toEqual({ term: 'GDP', meaning: 'The total value of goods produced in a year' });
  });

  it('a selected term finds its meaning in the sentence around it', () => {
    const context = 'Plants are remarkable. Photosynthesis is how plants turn light into sugar. It needs water.';
    expect(infer('Photosynthesis', context)).toEqual({ term: 'Photosynthesis', meaning: 'How plants turn light into sugar' });
  });

  it('leaves the meaning empty rather than guessing', () => {
    expect(infer('Entropy', 'We talked about entropy today.')).toEqual({ term: 'Entropy', meaning: '' });
    const long = 'a long passage that does not follow any of the definition patterns at all really';
    expect(infer(long, '').term).toBe('');
  });
});
