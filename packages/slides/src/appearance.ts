export interface DrawingGradient {
  readonly kind: "linear" | "radial";
  readonly angle: number;
  readonly scaled: boolean;
  readonly center: readonly [number, number];
  readonly stops: readonly {
    readonly offset: number;
    readonly color: string;
  }[];
}
export interface DrawingShadow {
  readonly color: string;
  readonly blur: number;
  readonly x: number;
  readonly y: number;
}
export interface DrawingLineEnd {
  readonly type: string;
  readonly width: number;
  readonly length: number;
}
export interface DrawingPictureFill {
 readonly bytes: Uint8Array;
 readonly contentType: string;
 readonly crop: readonly [number,number,number,number];
 readonly stretch?: readonly [number,number,number,number];
 readonly tile?: {readonly x:number;readonly y:number;readonly scaleX:number;readonly scaleY:number;readonly align:string;readonly flip:string};
}
