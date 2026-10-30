                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#a66b27]">
                                    Photo {index + 1}
                                  </p>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      title="Move photo up"
                                      onClick={() =>
                                        void movePhoto(photo, 'up')
                                      }
                                      disabled={
                                        index === 0 ||
                                        movingPhotoId !== null
                                      }
                                      className="rounded-lg border border-stone-300 bg-white p-2 text-stone-600 disabled:opacity-40"
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      title="Move photo down"
                                      onClick={() =>
                                        void movePhoto(photo, 'down')
                                      }
                                      disabled={
                                        index === photos.length - 1 ||
                                        movingPhotoId !== null
                                      }
                                      className="rounded-lg border border-stone-300 bg-white p-2 text-stone-600 disabled:opacity-40"
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      title="Delete photo"
                                      onClick={() =>
                                        void deleteStoryPhoto(photo)
                                      }
                                      disabled={
                                        deletingPhotoId === photo.id
                                      }
                                      className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 disabled:opacity-50"
                                    >
                                      {deletingPhotoId === photo.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <label className="mt-3 block text-sm font-semibold">
                                  Caption
                                </label>

                                <textarea
                                  rows={3}
                                  value={photo.caption || ''}
                                  onChange={(event) =>
                                    updatePhotoCaption(
                                      photo.id,
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Describe this photo for the family book."
                                  className="mt-1.5 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm"
                                />

                                <button
                                  type="button"
                                  onClick={() =>
                                    void savePhotoCaption(photo)
                                  }
                                  disabled={
                                    savingPhotoId === photo.id
                                  }
                                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-[#fffaf0] px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
                                >
                                  {savingPhotoId === photo.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}

                                  {savingPhotoId === photo.id
                                    ? 'Saving caption…'
                                    : 'Save Caption'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl bg-stone-100 p-4 text-sm text-stone-500">
                        No photos are attached to this story yet.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void saveEditor()
                    }
                    disabled={
                      savingEditor ||
                      creatingStory ||
                      reTranscribing ||
                      labelingSpeakers
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b4536] px-4 py-3.5 font-semibold text-white disabled:bg-stone-400"
                  >
                    {savingEditor ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}

                    {savingEditor
                      ? 'Saving changes…'
                      : 'Save category, speaker names, transcript and story'}
                  </button>
