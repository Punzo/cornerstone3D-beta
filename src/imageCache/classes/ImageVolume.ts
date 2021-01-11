import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses'
import { ImageVolumeInterface, Metadata } from './interfaces'
import { Point3 } from './../../cornerstone-tools-3d/types'

export default class ImageVolume {
  readonly uid: string
  dimensions: Point3
  direction: Array<number>
  metadata: Metadata
  origin: Array<number>
  scalarData: Float32Array | Uint8Array
  scaling?: {
    PET?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number
      SUVbsaFactor?: number
      // accessed in ProbeTool
      suvbwToSuvlbm?: number
      suvbwToSuvbsa?: number
    }
  }
  spacing: Array<number>
  vtkImageData: any
  vtkOpenGLTexture: any // No good way of referencing vtk classes as they aren't classes.

  constructor(props: ImageVolumeInterface) {
    this.uid = props.uid
    this.metadata = props.metadata
    this.dimensions = props.dimensions
    this.spacing = props.spacing
    this.origin = props.origin
    this.direction = props.direction
    this.vtkImageData = props.vtkImageData
    this.scalarData = props.scalarData
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance()

    if (props.scaling) {
      this.scaling = props.scaling
    }
  }
}
