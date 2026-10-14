import { getKit } from './kit';
import type { ModalFrameProps } from './legacy/modal-frame';

export function ModalFrame(props: ModalFrameProps) {
  const Impl = getKit().ModalFrame;
  return <Impl {...props} />;
}

export type { ModalFrameProps };
