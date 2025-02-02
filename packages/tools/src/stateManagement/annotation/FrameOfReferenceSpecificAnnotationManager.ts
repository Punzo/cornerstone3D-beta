import {
  Annotation,
  Annotations,
  FrameOfReferenceSpecificAnnotations,
  AnnotationState,
} from '../../types/AnnotationTypes';
import cloneDeep from 'lodash.clonedeep';

import { Enums, eventTarget, Types, utilities } from '@cornerstonejs/core';

import { checkAndDefineIsLockedProperty } from './annotationLocking';
import { checkAndDefineIsVisibleProperty } from './annotationVisibility';

interface FilterInterface {
  FrameOfReferenceUID?: string;
  toolName?: string;
}

/**
 * This class stores annotations in per FrameOfReference. Tool coordinates are
 * in the world coordinates for the viewports, which is the patient coordinate system for DICOM.
 *
 * Each FrameOfReferenceSpecificAnnotationManager is separate, so it is be possible
 * to render different annotations of the same tool on different viewports that share
 * the same FrameOfReferenceUID, however no core tool in this library currently does this.
 * This could be useful for e.g. viewing two different reads of the same data side-by-side.
 *
 * Note that this class is a singleton and should not be instantiated directly.
 * To get the stored annotations information you can use ToolState helpers.
 *
 */
export default class FrameOfReferenceSpecificAnnotationManager {
  private annotations: AnnotationState;
  public readonly uid: string;

  /**
   * @param uid - The uid of the state manager. If omitted it is autogenerated.
   */
  constructor(uid?: string) {
    if (!uid) {
      uid = utilities.uuidv4();
    }
    this.annotations = {};
    this.uid = uid;

    // Listen to the IMAGE_VOLUME_MODIFIED event to invalidate data.
    eventTarget.addEventListener(
      Enums.Events.IMAGE_VOLUME_MODIFIED,
      this._imageVolumeModifiedHandler
    );
  }

  /**
   * When a volume is modified we invalidate all of the `annotations` on the
   * volume's `FrameOfReferenceUID`. This is mainly to update statistics calculations
   * when an annotation is drawn whilst data is still loading.
   *
   * @param evt - The IMAGE_VOLUME_MODIFIED rendering event.
   */
  _imageVolumeModifiedHandler = (
    evt: Types.EventTypes.ImageVolumeModifiedEvent
  ) => {
    const eventDetail = evt.detail;
    const { FrameOfReferenceUID } = eventDetail;

    const annotations = this.annotations;
    const frameOfReferenceSpecificAnnotations =
      annotations[FrameOfReferenceUID];

    if (!frameOfReferenceSpecificAnnotations) {
      return;
    }

    Object.keys(frameOfReferenceSpecificAnnotations).forEach((toolName) => {
      const toolSpecificAnnotations =
        frameOfReferenceSpecificAnnotations[toolName];

      toolSpecificAnnotations.forEach((annotation) => {
        const invalidated = annotation.invalidated;

        if (invalidated !== undefined) {
          annotation.invalidated = true;
        }
      });
    });
  };

  /**
   * Returns all the available frameOfReferences inside the state manager
   * @returns - All the registered frame of references inside the manager
   */
  getFramesOfReference = (): Array<string> => {
    return Object.keys(this.annotations);
  };

  /**
   * get all tools `Annotations` for the provided FrameOfReference
   *
   * @param FrameOfReferenceUID - The UID of the FrameOfReference to retrieve data for.
   * @returns FrameOfReferenceSpecificAnnotations
   */
  getFrameOfReferenceAnnotations = (
    FrameOfReferenceUID: string
  ): FrameOfReferenceSpecificAnnotations => {
    return this.annotations[FrameOfReferenceUID];
  };

  /**
   * Get `Annotations` from the the manager given the `FrameOfReferenceUID` and `toolName`.
   *
   * @param FrameOfReferenceUID - The UID of the FrameOfReference to retrieve data for.
   * @param toolName - The name of the tool to retrieve data for.
   */
  get = (
    FrameOfReferenceUID: string,
    toolName: string
  ): Annotations | undefined => {
    const frameOfReferenceSpecificAnnotations =
      this.annotations[FrameOfReferenceUID];

    if (!frameOfReferenceSpecificAnnotations) {
      return;
    }

    return frameOfReferenceSpecificAnnotations[toolName];
  };

  /**
   * Given the unique identified for the some `annotation`, returns the `annotation`
   * from the `annotations`. Searches are more efficient if either/both of
   * the `FrameOfReferenceUID` and the `toolName` are given by the `filter`.
   *
   * @param annotationUID - The unique identifier of the `annotation`.
   * @param filter - A `filter` which reduces the scope of the search.
   *
   * @returns The retrieved `annotation`.
   */
  getAnnotation = (
    annotationUID: string,
    filter: FilterInterface = {}
  ): Annotation | undefined => {
    const toolSpecificAnnotationsAndIndex =
      this._getToolSpecificAnnotationsAndIndex(annotationUID, filter);

    if (!toolSpecificAnnotationsAndIndex) {
      return;
    }

    const { toolSpecificAnnotations, index } = toolSpecificAnnotationsAndIndex;

    return toolSpecificAnnotations[index];
  };

  /**
   * Adds an instance of `Annotation` to the `annotations`.
   *
   * @param annotation - The annotation to add.
   */
  addAnnotation = (annotation: Annotation): void => {
    const { metadata } = annotation;
    const { FrameOfReferenceUID, toolName } = metadata;

    const annotations = this.annotations;

    let frameOfReferenceSpecificAnnotations = annotations[FrameOfReferenceUID];

    if (!frameOfReferenceSpecificAnnotations) {
      annotations[FrameOfReferenceUID] = {};

      frameOfReferenceSpecificAnnotations = annotations[FrameOfReferenceUID];
    }

    let toolSpecificAnnotations = frameOfReferenceSpecificAnnotations[toolName];

    if (!toolSpecificAnnotations) {
      frameOfReferenceSpecificAnnotations[toolName] = [];

      toolSpecificAnnotations = frameOfReferenceSpecificAnnotations[toolName];
    }

    toolSpecificAnnotations.push(annotation);
    checkAndDefineIsLockedProperty(annotation);
    checkAndDefineIsVisibleProperty(annotation);
  };

  /**
   * Removes an instance of `Annotation` from the `annotations`.
   *
   * @param annotation - The annotation to remove.
   */
  // removeAnnotation = (annotation: Annotation): void => {
  //   const { metadata } = annotation
  //   const { FrameOfReferenceUID, toolName, annotationUID } = metadata
  //   const annotations = this.annotations

  //   const frameOfReferenceSpecificAnnotations = annotations[FrameOfReferenceUID]

  //   if (!frameOfReferenceSpecificAnnotations) {
  //     throw new Error(
  //       `frameOfReferenceSpecificAnnotations with FrameOfReferenceUID ${FrameOfReferenceUID} does not exist.`
  //     )
  //   }

  //   const toolSpecificAnnotations = frameOfReferenceSpecificAnnotations[toolName]
  //   if (!toolSpecificAnnotations) {
  //     throw new Error(
  //       `toolSpecificAnnotations for toolName ${toolName} on FrameOfReferenceUID ${FrameOfReferenceUID} does not exist.`
  //     )
  //   }

  //   const index = toolSpecificAnnotations.findIndex(
  //     (annotation) => annotation.metadata.annotationUID === annotationUID
  //   )

  //   toolSpecificAnnotations.splice(index, 1)

  //   // remove tool specific annotations if no annotation is left
  //   if (!toolSpecificAnnotations.length) {
  //     delete frameOfReferenceSpecificAnnotations[toolName]
  //   }

  //   // Make sure it is not held in the global set of locked instances
  //   setAnnotationLocked(annotation, false)
  // }

  /**
   * Given the unique identified for the some `annotation`, removes the `annotation`
   * from the `annotations`. Searches are more efficient if either/both of
   * the `FrameOfReferenceUID` and the `toolName` are given by the `filter`.
   *
   * @param annotationUID - The unique identifier of the `annotation` to remove.
   * @param filter - A `filter` which reduces the scope of the search.
   */
  removeAnnotation = (annotationUID: string, filter: FilterInterface = {}) => {
    const toolSpecificAnnotationsAndIndex =
      this._getToolSpecificAnnotationsAndIndex(annotationUID, filter);

    if (!toolSpecificAnnotationsAndIndex) {
      return;
    }

    const { toolSpecificAnnotations, index } = toolSpecificAnnotationsAndIndex;
    const { metadata } = toolSpecificAnnotations[0];

    toolSpecificAnnotations.splice(index, 1);

    // remove tool specific annotations if no annotation is left
    if (!toolSpecificAnnotations.length) {
      const { toolName } = metadata;
      delete this.annotations[metadata.FrameOfReferenceUID][toolName];
    }
  };

  /**
   * Returns a section of the annotations. Useful for serialization.
   *
   * - If no arguments are given, the entire `AnnotationState` instance is returned.
   * - If the `FrameOfReferenceUID` is given, the corresponding
   * `FrameOfReferenceSpecificAnnotations` instance is returned.
   * - If both the `FrameOfReferenceUID` and the `toolName` are are given, the
   * corresponding `Annotations` instance is returned.
   *
   * @param FrameOfReferenceUID - A filter string for returning the `annotations` of a specific frame of reference.
   * @param toolName - A filter string for returning `annotations` for a specific tool on a specific frame of reference.
   *
   * @returns The retrieved `annotation`.
   */
  saveAnnotations = (
    FrameOfReferenceUID?: string,
    toolName?: string
  ): AnnotationState | FrameOfReferenceSpecificAnnotations | Annotations => {
    const annotations = this.annotations;

    if (FrameOfReferenceUID && toolName) {
      const frameOfReferenceSpecificAnnotations =
        annotations[FrameOfReferenceUID];

      if (!frameOfReferenceSpecificAnnotations) {
        return;
      }

      const toolSpecificAnnotations =
        frameOfReferenceSpecificAnnotations[toolName];

      return cloneDeep(toolSpecificAnnotations);
    } else if (FrameOfReferenceUID) {
      const frameOfReferenceSpecificAnnotations =
        annotations[FrameOfReferenceUID];

      return cloneDeep(frameOfReferenceSpecificAnnotations);
    }

    return cloneDeep(annotations);
  };

  /**
   * Restores a section of the `annotations`. Useful for loading in serialized data.
   *
   * - If no arguments are given, the entire `AnnotationState` instance is restored.
   * - If the `FrameOfReferenceUID` is given, the corresponding
   * `FrameOfReferenceSpecificAnnotations` instance is restored.
   * - If both the `FrameOfReferenceUID` and the `toolName` are are given, the
   * corresponding `Annotations` instance is restored.
   *
   * @param FrameOfReferenceUID - A filter string for restoring only the `annotations` of a specific frame of reference.
   * @param toolName - A filter string for restoring `annotation` for a specific tool on a specific frame of reference.
   */
  restoreAnnotations = (
    state: AnnotationState | FrameOfReferenceSpecificAnnotations | Annotations,
    FrameOfReferenceUID?: string,
    toolName?: string
  ): void => {
    const annotations = this.annotations;

    if (FrameOfReferenceUID && toolName) {
      // Set Annotations for FrameOfReferenceUID and toolName.

      let frameOfReferenceSpecificAnnotations =
        annotations[FrameOfReferenceUID];

      if (!frameOfReferenceSpecificAnnotations) {
        annotations[FrameOfReferenceUID] = {};

        frameOfReferenceSpecificAnnotations = annotations[FrameOfReferenceUID];
      }

      frameOfReferenceSpecificAnnotations[toolName] = <Annotations>state;
    } else if (FrameOfReferenceUID) {
      // Set FrameOfReferenceSpecificAnnotations for FrameOfReferenceUID.

      annotations[FrameOfReferenceUID] = <FrameOfReferenceSpecificAnnotations>(
        state
      );
    } else {
      // Set entire annotations

      this.annotations = <AnnotationState>cloneDeep(state);
    }
  };

  /**
   * Given the unique identifier for a tool, returns the `Annotations`
   * it belongs to, and the `index` of its position in that array.
   *
   * @param annotationUID - The unique identifier of the `annotation`.
   * @param filter - A `filter` which reduces the scope of the search.
   *
   * @returns {object}
   * @returns {object.toolSpecificAnnotations} The `Annotations` instance containing the `annotation`.
   * @returns {object.index} The `index` of the `annotation` in the `toolSpecificAnnotations` array.
   *
   * @internal
   */
  private _getToolSpecificAnnotationsAndIndex(
    annotationUID: string,
    filter: FilterInterface
  ): { toolSpecificAnnotations: Annotations; index: number } {
    const { toolName, FrameOfReferenceUID } = filter;
    const annotations = this.annotations;

    let frameOfReferenceUIDKeys;

    if (FrameOfReferenceUID) {
      frameOfReferenceUIDKeys = [FrameOfReferenceUID];
    } else {
      frameOfReferenceUIDKeys = Object.keys(annotations);
    }

    const numFrameOfReferenceUIDKeys = frameOfReferenceUIDKeys.length;

    for (let i = 0; i < numFrameOfReferenceUIDKeys; i++) {
      const frameOfReferenceUID = frameOfReferenceUIDKeys[i];
      const frameOfReferenceSpecificAnnotations =
        annotations[frameOfReferenceUID];

      let toolNameKeys;

      if (toolName) {
        toolNameKeys = [toolName];
      } else {
        toolNameKeys = Object.keys(frameOfReferenceSpecificAnnotations);
      }

      const numToolNameKeys = toolNameKeys.length;

      for (let j = 0; j < numToolNameKeys; j++) {
        const toolName = toolNameKeys[j];

        const toolSpecificAnnotations =
          frameOfReferenceSpecificAnnotations[toolName];

        const index = toolSpecificAnnotations.findIndex(
          (annotation) => annotation.annotationUID === annotationUID
        );

        if (index !== -1) {
          return { toolSpecificAnnotations, index };
        }
      }
    }
  }
}

const defaultFrameOfReferenceSpecificAnnotationManager =
  new FrameOfReferenceSpecificAnnotationManager('DEFAULT');

export { defaultFrameOfReferenceSpecificAnnotationManager };
