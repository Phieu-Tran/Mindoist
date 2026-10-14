import { getKitOverrides } from './kit';
import { ModalFrame as LegacyModalFrame, type ModalFrameProps } from './legacy/modal-frame';

export function ModalFrame(props: ModalFrameProps) {
  const Impl = getKitOverrides().ModalFrame ?? LegacyModalFrame;
  return <Impl {...props} />;
}

export type { ModalFrameProps };
