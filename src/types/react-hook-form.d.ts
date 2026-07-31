// Ambient declarations for react-hook-form and @hookform/resolvers.
// The installed copies are missing their .d.ts files (broken node_modules
// state in this environment: SWC binary and package types are absent).
// Restores typing so form components type-check with the full TS config.
declare module 'react-hook-form' {
  export interface FieldValues {
    [x: string]: any;
  }

  export type FieldPath<TFieldValues extends FieldValues> = keyof TFieldValues & string;

  export interface ControllerRenderProps<TFieldValues extends FieldValues = FieldValues> {
    value: any;
    onChange: (value: any) => void;
    onBlur: () => void;
    name: string;
    ref: (el: any) => void;
  }

  export interface FieldError {
    type?: string;
    message?: string;
    ref?: any;
  }

  export interface FieldErrors<TFieldValues extends FieldValues = FieldValues> {
    [name: string]: FieldError | undefined;
  }

  export interface UseFormReturn<TFieldValues extends FieldValues = FieldValues> {
    control: any;
    register: (name: string, options?: Record<string, any>) => Record<string, any>;
    handleSubmit: (
      onValid: (values: TFieldValues) => void | Promise<void>,
      onInvalid?: (errors: FieldErrors<TFieldValues>) => void
    ) => (e?: any) => Promise<void>;
    reset: (values?: Partial<TFieldValues> | any, options?: Record<string, any>) => void;
    watch: (name?: string, defaultValue?: any) => any;
    setValue: (name: string, value: any, options?: Record<string, any>) => void;
    getValues: (name?: string) => any;
    trigger: (name?: string | string[]) => Promise<boolean>;
    setError: (name: string, error: { type?: string; message: string }) => void;
    clearErrors: (name?: string | string[]) => void;
    unregister: (name: string | string[]) => void;
    formState: {
      errors: FieldErrors<TFieldValues>;
      isSubmitting: boolean;
      isDirty: boolean;
      isValid: boolean;
      isSubmitted: boolean;
    };
  }

  export interface UseFieldArrayReturn {
    fields: any[];
    append: (value: any | any[], options?: Record<string, any>) => void;
    prepend: (value: any | any[], options?: Record<string, any>) => void;
    insert: (index: number, value: any, options?: Record<string, any>) => void;
    remove: (index?: number | number[]) => void;
    swap: (indexA: number, indexB: number) => void;
    move: (from: number, to: number) => void;
    update: (index: number, value: any) => void;
    replace: (values: any[]) => void;
  }

  export interface ControllerProps<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  > {
    name: TName;
    control?: any;
    render: (props: {
      field: ControllerRenderProps<TFieldValues>;
      fieldState: { invalid: boolean; isTouched: boolean; isDirty: boolean; error?: FieldError };
      formState: Record<string, any>;
    }) => React.ReactNode;
    defaultValue?: any;
    rules?: Record<string, any>;
    disabled?: boolean;
    shouldUnregister?: boolean;
  }

  export const Controller: <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  >(
    props: ControllerProps<TFieldValues, TName>
  ) => React.ReactElement | null;

  export function useForm<TFieldValues extends FieldValues = FieldValues>(
    options?: Record<string, any>
  ): UseFormReturn<TFieldValues>;

  export function useFieldArray(options: {
    control: any;
    name: string;
    keyName?: string;
    rules?: Record<string, any>;
    shouldUnregister?: boolean;
  }): UseFieldArrayReturn;

  export function FormProvider(props: { children: React.ReactNode; [key: string]: any }): React.ReactElement | null;

  export function useFormContext<TFieldValues extends FieldValues = FieldValues>(): UseFormReturn<TFieldValues>;

  export function useController<TFieldValues extends FieldValues = FieldValues>(
    props: Record<string, any>
  ): { field: ControllerRenderProps<TFieldValues>; fieldState: Record<string, any>; formState: Record<string, any> };

  export function useFormState(options?: Record<string, any>): Record<string, any>;

  export function useWatch(options?: Record<string, any>): any;
}

declare module '@hookform/resolvers/zod' {
  export function zodResolver(
    schema: any,
    ...opts: any[]
  ): (values: any, context: any, options: any) => Record<string, any>;
}
