import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
} from '../../stateManagement/annotation/annotationState';
import { polyline } from '../../utilities/math';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import registerDrawLoop from './planarFreehandROITool/drawLoop';
import registerEditLoopCommon from './planarFreehandROITool/editLoopCommon';
import registerClosedContourEditLoop from './planarFreehandROITool/closedContourEditLoop';
import registerOpenContourEditLoop from './planarFreehandROITool/openContourEditLoop';
import registerOpenContourEndEditLoop from './planarFreehandROITool/openContourEndEditLoop';
import registerRenderMethods from './planarFreehandROITool/renderMethods';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';
import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
} from '../../types';
import { PlanarFreehandROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { PlanarFreehandROICommonData } from '../../utilities/math/polyline/planarFreehandROIInternalTypes';

const { pointCanProjectOnLine } = polyline;

/**
 * PlanarFreehandROITool lets you draw annotations that define an arbitrarily drawn region.
 * You can use the PlanarFreehandROITool in all perpendicular views (axial, sagittal, coronal),
 * support for oblique views is possible, but not yet supported, due to the implementation of
 * `getSubPixelSpacingAndXYDirections`.
 *
 * The resulting annotation's data and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(PlanarFreehandROITool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(PlanarFreehandROITool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.
 */
class PlanarFreehandROITool extends AnnotationTool {
  static toolName = 'PlanarFreehandROI';

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  private commonData?: PlanarFreehandROICommonData;
  isDrawing = false;
  isEditingClosed = false;
  isEditingOpen = false;

  private activateDraw: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateClosedContourEdit: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateOpenContourEdit: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateOpenContourEndEdit: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;

  private renderContour: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: PlanarFreehandROIAnnotation
  ) => void;
  private renderContourBeingDrawn: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: PlanarFreehandROIAnnotation
  ) => void;
  private renderClosedContourBeingEdited: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: PlanarFreehandROIAnnotation
  ) => void;
  private renderOpenContourBeingEdited: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: PlanarFreehandROIAnnotation
  ) => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        allowOpenContours: true,
        // Proximity in canvas coordinates used to join contours.
        closeContourProximity: 10,
        // The proximity at which we fallback to the simplest grabbing logic for
        // determining what index of the contour to start editing.
        checkCanvasEditFallbackProximity: 6,
        // The relative distance that points should be dropped along the polyline
        // in units of the image pixel spacing. A value of 1 means that nodes must
        // be placed no closed than the image spacing apart. A value of 4 means that 4
        // nodes should be placed within the space of one image pixel size. A higher
        // value gives more finese to the tool/smoother lines, but the value cannot
        // be infinite as the lines become very computationally expensive to draw.
        subPixelResolution: 4,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    // Register event loops and rendering logic, which are stored in different
    // Files due to their complexity/size.
    registerDrawLoop(this);
    registerEditLoopCommon(this);
    registerClosedContourEditLoop(this);
    registerOpenContourEditLoop(this);
    registerOpenContourEndEditLoop(this);
    registerRenderMethods(this);
  }

  /**
   * Based on the current position of the mouse and the current image, creates
   * a `PlanarFreehandROIAnnotation` and stores it in the annotationManager.
   *
   * @param evt - `EventTypes.NormalizedMouseEventType`
   * @returns The `PlanarFreehandROIAnnotation` object.
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): PlanarFreehandROIAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    const annotation: PlanarFreehandROIAnnotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.getToolName(),
      },
      data: {
        handles: {
          points: [], // Handle points for open contours
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
        polyline: [<Types.Point3>[...worldPos]], // Polyline coordinates
        label: '',
      },
    };

    addAnnotation(element, annotation);

    this.activateDraw(evt, annotation, viewportIdsToRender);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * Begins an edit of an open contour, when the mouse has selected a handle
   * (end) of the open contour.
   *
   * @param evt - `EventTypes.MouseDownEventType`
   * @param annotation - `PlanarFreehandROIAnnotation` annotation.
   * @param handle - The handle index, 0 for the start and 1 for the end.
   * @param interactionType - interaction type (mouse, touch)
   */
  handleSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: PlanarFreehandROIAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.activateOpenContourEndEdit(evt, annotation, viewportIdsToRender);
  };

  /**
   * Edits the open or closed contour when the line is grabbed and dragged.
   */
  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: PlanarFreehandROIAnnotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    if (annotation.data.isOpenContour) {
      this.activateOpenContourEdit(evt, annotation, viewportIdsToRender);
    } else {
      this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
    }
  };

  /**
   * Returns if the canvas point is near the line of the given annotation in the
   * provided element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - The `PlanarFreehandROIAnnotation`.
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: PlanarFreehandROIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const points = annotation.data.polyline;

    // NOTE: It is implemented this way so that we do not double calculate
    // points when number crunching adjacent line segments.
    let previousPoint = viewport.worldToCanvas(points[0]);

    for (let i = 1; i < points.length; i++) {
      const p1 = previousPoint;
      const p2 = viewport.worldToCanvas(points[i]);

      const distance = pointCanProjectOnLine(canvasCoords, p1, p2, proximity);

      if (distance === true) {
        return true;
      }

      previousPoint = p2;
    }

    if (annotation.data.isOpenContour) {
      // Contour is open, don't check last point to first point.
      return false;
    }

    // check last point to first point
    const pStart = viewport.worldToCanvas(points[0]);
    const pEnd = viewport.worldToCanvas(points[points.length - 1]);

    const distance = pointCanProjectOnLine(
      canvasCoords,
      pStart,
      pEnd,
      proximity
    );

    if (distance === true) {
      return true;
    }

    return false;
  };

  cancel = (element: HTMLDivElement): void => {
    // TODO CANCEL
  };

  /**
   * Triggers an annotation modified event.
   */
  triggerAnnotationModified = (
    annotation: PlanarFreehandROIAnnotation,
    enabledElement: Types.IEnabledElement
  ): void => {
    const { viewportId, renderingEngineId } = enabledElement;
    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };
    triggerEvent(eventTarget, eventType, eventDetail);
  };

  /**
   * Triggers an annotation completed event.
   */
  triggerAnnotationCompleted = (
    annotation: PlanarFreehandROIAnnotation
  ): void => {
    const eventType = Events.ANNOTATION_COMPLETED;

    const eventDetail: AnnotationCompletedEventDetail = {
      annotation,
    };

    triggerEvent(eventTarget, eventType, eventDetail);
  };

  /**
   * Draws the `PlanarFreehandROIAnnotation`s at each request animation frame.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = <PlanarFreehandROIAnnotation[]>(
      getAnnotations(element, this.getToolName())
    );

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      return;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    ) as PlanarFreehandROIAnnotation[];

    if (!annotations?.length) {
      return;
    }

    const isDrawing = this.isDrawing;
    const isEditingOpen = this.isEditingOpen;
    const isEditingClosed = this.isEditingClosed;

    if (!(isDrawing || isEditingOpen || isEditingClosed)) {
      // No annotations are currently being modified, so we can just use the
      // render contour method to render all of them
      annotations.forEach((annotation) =>
        this.renderContour(enabledElement, svgDrawingHelper, annotation)
      );

      return;
    }

    // One of the annotations will need special rendering treatment, render all
    // other annotations not being interacted with using the standard renderContour
    // rendering path.
    const activeAnnotationUID = this.commonData.annotation.annotationUID;

    annotations.forEach((annotation) => {
      if (annotation.annotationUID === activeAnnotationUID) {
        if (isDrawing) {
          this.renderContourBeingDrawn(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else if (isEditingClosed) {
          this.renderClosedContourBeingEdited(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else if (isEditingOpen) {
          this.renderOpenContourBeingEdited(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else {
          throw new Error(
            `Unknown ${this.getToolName()} annotation rendering state`
          );
        }
      } else {
        this.renderContour(enabledElement, svgDrawingHelper, annotation);
      }
    });
  };
}

export default PlanarFreehandROITool;
