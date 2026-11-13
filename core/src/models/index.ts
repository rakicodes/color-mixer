import { oklabMixModel, type MixModel, type MixModelId } from '../mix';
import { beerLambertRgbModel, beerLambertSpectralModel } from './beerLambert';
import { kubelkaMunkModel } from './kubelkaMunk';

export { beerLambertRgbModel, beerLambertSpectralModel, kubelkaMunkModel };

export const MIX_MODELS: Record<MixModelId, MixModel> = {
  oklab: oklabMixModel as MixModel,
  'bl-rgb': beerLambertRgbModel as MixModel,
  'bl-spectral': beerLambertSpectralModel as MixModel,
  'km-spectral': kubelkaMunkModel as MixModel,
};

export const DEFAULT_MIX_MODEL: MixModelId = 'oklab';

export function isMixModelId(id: unknown): id is MixModelId {
  return typeof id === 'string' && id in MIX_MODELS;
}

/** Look up a model by id; unknown ids fall back to the default. */
export function getMixModel(id: unknown): MixModel {
  return MIX_MODELS[isMixModelId(id) ? id : DEFAULT_MIX_MODEL];
}
