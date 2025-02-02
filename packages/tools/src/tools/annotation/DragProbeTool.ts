/* eslint-disable @typescript-eslint/no-empty-function */
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { hideElementCursor } from '../../cursors/elementCursor';
import { EventTypes, PublicToolProps, ToolProps } from '../../types';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import ProbeTool from './ProbeTool';
import { ProbeAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';

export default class DragProbeTool extends ProbeTool {
  static toolName = 'DragProbe';

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    newAnnotation?: boolean;
  } | null;
  eventDispatchDetail: {
    viewportId: string;
    renderingEngineId: string;
  };
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  postMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): ProbeAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
      },
      data: {
        label: '',
        handles: { points: [<Types.Point3>[...worldPos]] },
        cachedStats: {},
      },
    };

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      newAnnotation: true,
      viewportIdsToRender,
    };
    this._activateModify(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport } = enabledElement;

    if (!this.editData) {
      return;
    }

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const annotation = this.editData.annotation;
    const annotationUID = annotation.annotationUID;
    const data = annotation.data;
    const point = data.handles.points[0];
    const canvasCoordinates = viewport.worldToCanvas(point);

    styleSpecifier.annotationUID = annotationUID;

    const color = this.getStyle('color', styleSpecifier, annotation);

    if (!data.cachedStats[targetId]) {
      data.cachedStats[targetId] = {
        Modality: null,
        index: null,
        value: null,
      };

      this._calculateCachedStats(annotation, renderingEngine, enabledElement);
    } else if (annotation.invalidated) {
      this._calculateCachedStats(annotation, renderingEngine, enabledElement);
    }

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return;
    }

    const handleGroupUID = '0';

    drawHandlesSvg(
      svgDrawingHelper,
      annotationUID,
      handleGroupUID,
      [canvasCoordinates],
      { color }
    );

    const textLines = this._getTextLines(data, targetId);
    if (textLines) {
      const textCanvasCoordinates = [
        canvasCoordinates[0] + 6,
        canvasCoordinates[1] - 6,
      ];

      const textUID = '0';
      drawTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textUID,
        textLines,
        [textCanvasCoordinates[0], textCanvasCoordinates[1]],
        this.getLinkedTextBoxStyle(styleSpecifier, annotation)
      );
    }
  };
}
